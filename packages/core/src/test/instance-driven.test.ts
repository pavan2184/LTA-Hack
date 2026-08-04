import { describe, expect, it } from "vitest";

import { buildInstanceFromLiterals, type PlanningInstance } from "../domain/instance";
import { buildWorld, literalWorld } from "../domain/world";
import { reviewSubmittedPlan, solve } from "../engine/solve";
import { isFeasible, validate } from "../engine/validate";

/**
 * The engine plans and checks the night it was given.
 *
 * Everything else in this suite runs against the literals, which cannot tell
 * apart an engine that reads its inputs from one that has them compiled in.
 * These tests hand it a deliberately different night and insist the answers
 * move. Without them, "the validator can gate a plan built from Postgres" is a
 * claim rather than a property.
 */
const base = buildInstanceFromLiterals();
const world = literalWorld();

const withInstance = (change: (instance: PlanningInstance) => PlanningInstance) =>
  buildWorld(change(base));

describe("the solver plans the night it is handed", () => {
  it("holds work inside a shortened engineering window", () => {
    const short = withInstance((instance) => ({
      ...instance,
      window: { ...instance.window, endMinute: 150 },
    }));

    const result = solve({ strategy: "balanced", context: { world: short } });
    result.plan.placements.forEach((placement) => {
      const request = short.requestById[placement.requestId];
      expect(placement.endMinute + request.clearanceMinutes).toBeLessThanOrEqual(150);
    });
    // A window an hour and a half shorter cannot hold the same night.
    expect(result.plan.deferred.length).toBeGreaterThan(
      solve({ strategy: "balanced" }).plan.deferred.length,
    );
  });

  it("re-validates its own output against that same night, not the literals", () => {
    const short = withInstance((instance) => ({
      ...instance,
      window: { ...instance.window, endMinute: 150 },
    }));
    const result = solve({ strategy: "balanced", context: { world: short } });
    // The solver hands its finished plan back to the validator before returning.
    // If that check silently used the literal 04:00 window it would pass here
    // regardless, so the assertion is that the *reported* status is honest.
    expect(result.independentlyValidated).toBe(isFeasible(result.violations));
    expect(validate(result.plan, { world: short, windowEnd: 150 })).toEqual(result.violations);
  });

  it("plans only the requests the instance contains", () => {
    const fewer = withInstance((instance) => ({
      ...instance,
      requests: instance.requests.filter((request) => request.priority === "critical"),
    }));
    const result = solve({ strategy: "balanced", context: { world: fewer } });
    const planned = [
      ...result.plan.placements.map((p) => p.requestId),
      ...result.plan.deferred.map((d) => d.requestId),
    ];
    expect(planned.length).toBe(fewer.requests.length);
    planned.forEach((id) => expect(fewer.requestById[id].priority).toBe("critical"));
  });
});

describe("the validator judges against the night it is handed", () => {
  it("finds an equipment clash that the literals' unit count permits", () => {
    // Two signal testing kits exist, so M-003 and M-016 can overlap. With one,
    // the same plan breaks EQUIPMENT_CAPACITY — same placements, different night.
    const asPlanned = reviewSubmittedPlan();
    const scarce = withInstance((instance) => ({
      ...instance,
      equipment: instance.equipment.map((item) =>
        item.id === "E-SIG" ? { ...item, units: 1 } : item,
      ),
    }));

    const before = asPlanned.violations.filter((v) => v.ruleId === "EQUIPMENT_CAPACITY");
    const after = validate(asPlanned.plan, { world: scarce }).filter(
      (v) => v.ruleId === "EQUIPMENT_CAPACITY",
    );
    expect(after.length).toBeGreaterThan(before.length);
    expect(after.some((v) => v.subjects.includes("Signal testing kit"))).toBe(true);
  });

  it("stops reporting a clash the night no longer has", () => {
    // The single thermal imaging unit is what makes M-004 and M-011 a conflict.
    const plenty = withInstance((instance) => ({
      ...instance,
      equipment: instance.equipment.map((item) =>
        item.id === "E-THM" ? { ...item, units: 4 } : item,
      ),
    }));
    const plan = reviewSubmittedPlan().plan;
    const thermal = (violations: ReturnType<typeof validate>) =>
      violations.filter((v) => v.subjects.includes("Thermal imaging unit"));

    expect(thermal(validate(plan)).length).toBeGreaterThan(0);
    expect(thermal(validate(plan, { world: plenty }))).toHaveLength(0);
  });

  it("uses the topology it was given when judging adjacent work", () => {
    const severed = withInstance((instance) => ({ ...instance, adjacency: [] }));
    const plan = reviewSubmittedPlan().plan;
    // With no adjacency, nothing is one block apart, so the rule cannot fire.
    expect(validate(plan, { world: severed }).some((v) => v.ruleId === "ADJACENT_WORK")).toBe(false);
  });
});

describe("the input hash identifies which night was planned", () => {
  it("differs when the facts differ, with everything else held equal", () => {
    const scarce = withInstance((instance) => ({
      ...instance,
      equipment: instance.equipment.map((item) =>
        item.id === "E-SIG" ? { ...item, units: 1 } : item,
      ),
    }));
    const a = solve({ strategy: "balanced" });
    const b = solve({ strategy: "balanced", context: { world: scarce } });
    expect(b.inputHash).not.toBe(a.inputHash);
  });

  it("is unchanged when the same night is passed explicitly", () => {
    // Passing the literal world must be indistinguishable from passing nothing,
    // or every existing hash would move the day a caller starts being explicit.
    expect(solve({ strategy: "balanced", context: { world } }).inputHash).toBe(
      solve({ strategy: "balanced" }).inputHash,
    );
  });

  it("stays deterministic across repeated solves of a non-literal night", () => {
    const scarce = withInstance((instance) => ({
      ...instance,
      equipment: instance.equipment.map((item) =>
        item.id === "E-SIG" ? { ...item, units: 1 } : item,
      ),
    }));
    const first = solve({ strategy: "balanced", context: { world: scarce } });
    const second = solve({ strategy: "balanced", context: { world: scarce } });
    expect(second.inputHash).toBe(first.inputHash);
    expect(second.plan).toEqual(first.plan);
  });
});
