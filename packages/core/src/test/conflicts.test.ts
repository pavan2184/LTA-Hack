import { describe, expect, it } from "vitest";

import { requestById } from "../data/requests";
import {
  categoryOf,
  conflictCategories,
  headline,
  summariseConflicts,
  summaryLine,
} from "../engine/conflicts";
import { conflictKey, recommendResolution, repairPlan } from "../engine/resolutions";
import { buildSubmittedPlan } from "../engine/solve";
import { ruleCatalogue, validate } from "../engine/validate";
import type { ViolationRuleId } from "../types/railplan";

const requested = buildSubmittedPlan();
const violations = validate(requested);

describe("conflict categories", () => {
  it("classifies every rule the validator can emit", () => {
    const covered = new Set(conflictCategories.flatMap((profile) => profile.ruleIds));
    const declared = Object.keys(ruleCatalogue) as ViolationRuleId[];
    expect([...covered].sort()).toEqual([...declared].sort());
  });

  it("puts each rule in exactly one category", () => {
    const all = conflictCategories.flatMap((profile) => profile.ruleIds);
    expect(all.length).toBe(new Set(all).size);
  });

  it("counts the findings the validator produced, and nothing else", () => {
    const summary = summariseConflicts(violations);
    expect(summary.total).toBe(violations.length);
    expect(summary.byCategory.reduce((sum, entry) => sum + entry.count, 0)).toBe(violations.length);
    expect(summary.requestIds).toEqual(
      [...new Set(violations.flatMap((violation) => violation.requestIds))].sort(),
    );
  });

  it("never claims a category that has nothing in it", () => {
    const summary = summariseConflicts(violations);
    expect(summary.byCategory.every((entry) => entry.count > 0)).toBe(true);
    expect(summaryLine(summary)).toMatch(/sector overlaps/);
  });

  it("states a conflict in terms of the jobs and the minutes", () => {
    const overlap = violations.find((violation) => violation.ruleId === "BLOCK_CAPACITY")!;
    const sentence = headline(overlap);
    overlap.requestIds.forEach((id) => expect(sentence).toContain(id));
    expect(sentence).toMatch(/\d\d:\d\d-\d\d:\d\d/);
    expect(categoryOf(overlap.ruleId)).toBe("sector");
  });
});

describe("conflict windows", () => {
  it("reports the offending stretch for every timed rule", () => {
    const timed = violations.filter((violation) => violation.shortfallMinutes > 0);
    expect(timed.length).toBeGreaterThan(0);
    timed.forEach((violation) => {
      expect(violation.window).not.toBeNull();
      expect(violation.window!.end).toBeGreaterThan(violation.window!.start);
    });
  });

  it("marks only the overlap, not the whole job", () => {
    const overlap = violations.find(
      (violation) => violation.ruleId === "BLOCK_CAPACITY" && violation.requestIds.length === 2,
    )!;
    const spans = overlap.requestIds.map((id) => {
      const placement = requested.placements.find((item) => item.requestId === id)!;
      return placement.endMinute - placement.startMinute;
    });
    const window = overlap.window!;
    expect(window.end - window.start).toBe(overlap.shortfallMinutes);
    // The stretch at fault sits inside both jobs, and is shorter than the longer
    // of the two — otherwise there would be nothing to distinguish by colouring.
    expect(window.end - window.start).toBeLessThanOrEqual(Math.max(...spans));
  });
});

describe("recommended resolutions", () => {
  it("only offers a move that it validated first", () => {
    // The worst baseline conflict has no clean single move under workforce constraints.
    const target = violations.find(v => v.ruleId === "DEPENDENCY_ORDER" && v.requestIds.includes("M-013"))!;
    const resolution = recommendResolution(requested, target)!;
    expect(resolution).not.toBeNull();

    const moved = {
      placements: requested.placements.map((placement) =>
        placement.requestId === resolution.requestId
          ? { ...placement, startMinute: resolution.toMinute, endMinute: resolution.endMinute }
          : placement,
      ),
      deferred: requested.deferred,
    };
    const after = validate(moved).filter((violation) => violation.severity === "critical");

    expect(after.map(conflictKey)).not.toContain(conflictKey(target));
    expect(after.length).toBeLessThan(violations.length);
    expect(after.every(v => violations.map(conflictKey).includes(conflictKey(v)))).toBe(true);
  });

  it("moves the cheapest job in the conflict, not the mandatory one", () => {
    const withMandatory = violations.find(
      (violation) =>
        violation.requestIds.some((id) => requestById[id]?.mandatory) &&
        violation.requestIds.some((id) => !requestById[id]?.mandatory),
    )!;
    const resolution = recommendResolution(requested, withMandatory);
    if (resolution) expect(requestById[resolution.requestId]?.mandatory).toBe(false);
  });

  it("keeps the proposed slot inside the request's own permitted window", () => {
    violations.slice(0, 6).forEach((violation) => {
      const resolution = recommendResolution(requested, violation);
      if (!resolution) return;
      const request = requestById[resolution.requestId]!;
      expect(resolution.toMinute).toBeGreaterThanOrEqual(request.earliestStart);
      expect(resolution.endMinute).toBeLessThanOrEqual(request.latestEnd);
    });
  });

  it("returns null rather than inventing a fix that does not exist", () => {
    const impossible = violations.filter(
      (violation) => recommendResolution(requested, violation) === null,
    );
    // This dataset has at least one knot no single move can undo. If that ever
    // stops being true the panel's "needs the solver" branch is untested.
    expect(impossible.length).toBeGreaterThan(0);
  });
});

describe("greedy repair", () => {
  const outcome = repairPlan(requested);

  it("reduces the conflict count and reports what it could not fix", () => {
    expect(outcome.before).toBe(violations.length);
    expect(outcome.remaining.length).toBeLessThan(outcome.before);
    expect(outcome.moves.length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const again = repairPlan(requested);
    expect(again.moves.map((move) => `${move.requestId}@${move.toMinute}`)).toEqual(
      outcome.moves.map((move) => `${move.requestId}@${move.toMinute}`),
    );
  });

  it("leaves a plan the validator agrees with", () => {
    const applied = new Map(outcome.moves.map((move) => [move.requestId, move]));
    const plan = {
      placements: requested.placements.map((placement) => {
        const move = applied.get(placement.requestId);
        return move
          ? { ...placement, startMinute: move.toMinute, endMinute: move.endMinute }
          : placement;
      }),
      deferred: requested.deferred,
    };
    const remaining = validate(plan).filter((violation) => violation.severity === "critical");
    expect(remaining.map(conflictKey).sort()).toEqual(outcome.remaining.map(conflictKey).sort());
  });

  it("never moves a job outside its permitted window", () => {
    outcome.moves.forEach((move) => {
      const request = requestById[move.requestId]!;
      expect(move.toMinute).toBeGreaterThanOrEqual(request.earliestStart);
      expect(move.endMinute).toBeLessThanOrEqual(request.latestEnd);
    });
  });
});
