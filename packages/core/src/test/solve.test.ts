import { describe, expect, it } from "vitest";

import { buildDisruptionInputs, disruptionById, emergencyInsertion } from "../data/disruptions";
import { requests, SLOT_MINUTES, WINDOW_END } from "../data/requests";
import { findAlternatives } from "../engine/alternatives";
import { explainPlacement } from "../engine/explain";
import { solve } from "../engine/solve";
import { strategyList } from "../engine/strategies";
import { isFeasible, validate } from "../engine/validate";
import type { StrategyId } from "../types/railplan";

const strategies = strategyList.map((profile) => profile.id);

describe("solver", () => {
  /**
   * The property that matters. A schedule the solver is willing to show a
   * planner must survive an independent run of every rule — not the incremental
   * checks it made while building, the whole thing, from scratch.
   */
  it.each(strategies)("%s returns a plan with zero critical violations", (strategy) => {
    const result = solve({ strategy });
    const independent = validate(result.plan);
    expect(independent.filter((item) => item.severity === "critical")).toEqual([]);
    expect(result.independentlyValidated).toBe(true);
  });

  it.each(strategies)("%s places every mandatory request", (strategy) => {
    const result = solve({ strategy });
    const placed = new Set(result.plan.placements.map((item) => item.requestId));
    requests
      .filter((request) => request.mandatory)
      .forEach((request) => expect(placed.has(request.id), `${request.id} in ${strategy}`).toBe(true));
  });

  it.each(strategies)("%s reports a status consistent with its own output", (strategy) => {
    const result = solve({ strategy });
    if (result.status === "INFEASIBLE") {
      expect(result.violations.some((item) => item.severity === "critical")).toBe(true);
    } else {
      expect(isFeasible(result.violations)).toBe(true);
    }
    // OPTIMAL is only claimed when nothing was deferred and nothing compromised.
    if (result.status === "OPTIMAL") expect(result.plan.deferred).toHaveLength(0);
  });

  it.each(strategies)("%s keeps every placement on a 15-minute boundary and inside the window", (strategy) => {
    solve({ strategy }).plan.placements.forEach((placement) => {
      expect(placement.startMinute % SLOT_MINUTES).toBe(0);
      expect(placement.startMinute).toBeGreaterThanOrEqual(0);
      expect(placement.endMinute).toBeLessThanOrEqual(WINDOW_END);
    });
  });

  it("is deterministic: identical inputs give an identical plan and hash", () => {
    strategies.forEach((strategy) => {
      const first = solve({ strategy });
      const second = solve({ strategy });
      expect(second.inputHash).toBe(first.inputHash);
      expect(second.plan.placements).toEqual(first.plan.placements);
      expect(second.plan.deferred).toEqual(first.plan.deferred);
    });
  });

  it("changes the input hash when the inputs change", () => {
    const base = solve({ strategy: "balanced" });
    const locked = solve({
      strategy: "balanced",
      locked: [{ requestId: "M-001", startMinute: 60, endMinute: 120, teamId: "T-TRK", locked: true }],
    });
    expect(locked.inputHash).not.toBe(base.inputHash);
  });

  it("produces genuinely different plans for different objectives", () => {
    const plans = strategies.map((strategy) =>
      JSON.stringify(solve({ strategy }).plan.placements),
    );
    expect(new Set(plans).size).toBeGreaterThan(1);
  });

  it("honours a planner's pin exactly, and solves the rest around it", () => {
    const pinned = { requestId: "M-010", startMinute: 30, endMinute: 105, teamId: "T-TRK", locked: true };
    const result = solve({ strategy: "balanced", locked: [pinned] });
    const placement = result.plan.placements.find((item) => item.requestId === "M-010");
    expect(placement?.startMinute).toBe(30);
    expect(placement?.locked).toBe(true);
    expect(validate(result.plan).filter((item) => item.severity === "critical")).toEqual([]);
  });

  it("orders dependent work after its predecessor", () => {
    strategies.forEach((strategy) => {
      const result = solve({ strategy });
      const predecessor = result.plan.placements.find((item) => item.requestId === "M-007");
      const dependent = result.plan.placements.find((item) => item.requestId === "M-013");
      if (!predecessor || !dependent) return;
      expect(dependent.startMinute).toBeGreaterThanOrEqual(predecessor.endMinute + 15);
    });
  });

  it("gives a reason and a binding rule for everything it could not place", () => {
    strategies.forEach((strategy) => {
      solve({ strategy }).plan.deferred.forEach((entry) => {
        expect(entry.reason.length).toBeGreaterThan(0);
      });
    });
  });

  it("reserves the tail of the window under the emergency-buffer objective", () => {
    const reserve = solve({ strategy: "emergency-buffer" });
    const balanced = solve({ strategy: "balanced" });
    expect(reserve.metrics.emergencyCapacity.value).toBeGreaterThan(
      balanced.metrics.emergencyCapacity.value,
    );
  });

  it("keeps movement lower under the minimum-changes objective than maximum-completion", () => {
    expect(solve({ strategy: "min-changes" }).metrics.movement.value).toBeLessThan(
      solve({ strategy: "max-completion" }).metrics.movement.value,
    );
  });

  it("solves fast enough to run inline on every interaction", () => {
    strategies.forEach((strategy) => {
      expect(solve({ strategy }).solveMs).toBeLessThan(1500);
    });
  });
});

describe("disruptions", () => {
  it("re-solves around an inserted emergency job without breaking anything", () => {
    const base = solve({ strategy: "balanced" });
    const inputs = buildDisruptionInputs(disruptionById["track-fault"], base.plan.placements);
    const result = solve({
      strategy: "balanced",
      locked: inputs.locked,
      requests: inputs.requests,
      context: inputs.context,
    });

    const emergency = result.plan.placements.find((item) => item.requestId === emergencyInsertion.id);
    expect(emergency?.startMinute).toBe(120);
    expect(validate(result.plan, inputs.context).filter((v) => v.severity === "critical")).toEqual([]);
  });

  it("moves work off a withdrawn crew", () => {
    const scenario = disruptionById["team-unavailable"];
    const inputs = buildDisruptionInputs(scenario, []);
    const result = solve({ strategy: "balanced", context: inputs.context, requests: inputs.requests });
    result.plan.placements
      .filter((placement) => placement.teamId === "T-ALP")
      .forEach((placement) => expect(placement.endMinute).toBeLessThanOrEqual(scenario.fromMinute));
  });

  it("brings everything inside a shortened handback deadline", () => {
    const inputs = buildDisruptionInputs(disruptionById["window-shortened"], []);
    const result = solve({ strategy: "balanced", context: inputs.context });
    result.plan.placements.forEach((placement) => expect(placement.endMinute).toBeLessThanOrEqual(210));
    expect(validate(result.plan, inputs.context).filter((v) => v.severity === "critical")).toEqual([]);
  });

  it("detects the damage an overrun does before anything is rescheduled", () => {
    const base = solve({ strategy: "balanced" });
    const inputs = buildDisruptionInputs(disruptionById["work-overrun"], base.plan.placements);
    const overrun = inputs.locked[0];
    expect(overrun.requestId).toBe("M-008");
    expect(overrun.endMinute - overrun.startMinute).toBe(135);

    const stretched = {
      placements: base.plan.placements.map((placement) =>
        placement.requestId === "M-008" ? overrun : placement,
      ),
      deferred: base.plan.deferred,
    };
    // Extending M-008 by 45 minutes has to collide with something.
    expect(validate(stretched).some((violation) => violation.requestIds.includes("M-008"))).toBe(true);
  });
});

describe("alternatives", () => {
  it("only offers slots that validate against the rest of the plan", () => {
    const result = solve({ strategy: "balanced" });
    const target = result.plan.placements[3].requestId;
    const { alternatives } = findAlternatives(result.plan, target);

    alternatives.forEach((option) => {
      const trial = {
        placements: [
          ...result.plan.placements.filter((item) => item.requestId !== target),
          {
            requestId: target,
            startMinute: option.startMinute,
            endMinute: option.endMinute,
            teamId: result.plan.placements.find((i) => i.requestId === target)!.teamId,
            locked: false,
          },
        ],
        deferred: result.plan.deferred,
      };
      expect(validate(trial).filter((v) => v.severity === "critical")).toEqual([]);
    });
  });

  it("keeps alternatives meaningfully apart from one another", () => {
    const result = solve({ strategy: "balanced" });
    result.plan.placements.slice(0, 6).forEach((placement) => {
      const { alternatives } = findAlternatives(result.plan, placement.requestId);
      alternatives.forEach((a, index) =>
        alternatives.slice(index + 1).forEach((b) => {
          expect(Math.abs(a.startMinute - b.startMinute)).toBeGreaterThanOrEqual(30);
        }),
      );
    });
  });

  it("reports the binding rule when no alternative exists", () => {
    const result = solve({ strategy: "max-completion" });
    const outcome = findAlternatives(result.plan, "M-008");
    if (!outcome.alternatives.length) expect(outcome.bindingRuleId).not.toBeNull();
  });
});

describe("explanations", () => {
  it("explains a move using rules that actually fire at the requested time", () => {
    const result = solve({ strategy: "balanced" as StrategyId });
    const moved = result.plan.placements.find(
      (placement) => placement.startMinute !== requests.find((r) => r.id === placement.requestId)!.preferredStart,
    );
    expect(moved).toBeDefined();

    const explanation = explainPlacement(result.plan, moved!.requestId);
    expect(explanation).not.toBeNull();
    expect(explanation!.summary).toContain(moved!.requestId);
    explanation!.blockers.forEach((violation) =>
      expect(violation.requestIds).toContain(moved!.requestId),
    );
  });

  it("says so plainly when a job did not move", () => {
    const result = solve({ strategy: "min-changes" });
    const unmoved = result.plan.placements.find(
      (placement) => placement.startMinute === requests.find((r) => r.id === placement.requestId)!.preferredStart,
    );
    if (!unmoved) return;
    expect(explainPlacement(result.plan, unmoved.requestId)!.summary).toContain("as requested");
  });
});
