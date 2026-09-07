// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { createPlanSchema } from "@/lib/plans/schemas";
import { planInputDigest, validatePlanParameters } from "@/lib/plans/input";

describe("durable plan input contract", () => {
  it("changes saved-plan provenance for workforce supply or demand, independent of row order", () => {
    const facts = buildInstanceFromLiterals();
    const input = createPlanSchema.parse({ planningNight: facts.planningNight });
    const original = planInputDigest(facts, input);
    expect(facts.workforceAvailability.length).toBeGreaterThan(0);
    expect(facts.workforceDemand.length).toBeGreaterThan(0);
    expect(planInputDigest({ ...facts,
      workforceRoles: [...facts.workforceRoles].reverse(),
      workforceAvailability: [...facts.workforceAvailability].reverse(),
      workforceDemand: [...facts.workforceDemand].reverse(),
    }, input)).toBe(original);
    for (const key of ["workforceAvailability", "workforceDemand"] as const) {
      const changed = { ...facts, [key]: facts[key].map((row, index) =>
        index === 0 ? { ...row, count: row.count + 1 } : row) };
      expect(planInputDigest(changed, input)).not.toBe(original);
    }
  });
  it("bounds dates, strategies, pins and rejects caller-authored results", () => {
    expect(
      createPlanSchema.parse({ planningNight: "2026-08-03" }),
    ).toMatchObject({ strategy: "balanced", locked: [] });
    for (const body of [
      { planningNight: "2026-02-30" },
      { planningNight: "2026-08-03", strategy: "fake" },
      { planningNight: "2026-08-03", status: "OPTIMAL" },
      { planningNight: "2026-08-03", locked: Array(101).fill({}) },
    ])
      expect(createPlanSchema.safeParse(body).success).toBe(false);
  });
  it("validates pins against the selected night, assignment and exact duration", () => {
    const facts = buildInstanceFromLiterals();
    const r = facts.requests[0];
    const input = createPlanSchema.parse({
      planningNight: facts.planningNight,
      locked: [
        {
          requestId: r.id,
          teamId: r.teamId,
          startMinute: r.earliestStart,
          endMinute: r.earliestStart + r.durationMinutes,
        },
      ],
    });
    expect(() => validatePlanParameters(facts, input)).not.toThrow();
    for (const change of [
      { requestId: "unknown" },
      { teamId: "unknown" },
      { endMinute: input.locked[0].endMinute + 1 },
    ])
      expect(() =>
        validatePlanParameters(facts, {
          ...input,
          locked: [{ ...input.locked[0], ...change }],
        }),
      ).toThrow();
    expect(() =>
      validatePlanParameters(facts, {
        ...input,
        locked: [...input.locked, ...input.locked],
      }),
    ).toThrow();
  });
  it("hashes full facts and all pin fields, independent of object/set ordering", () => {
    const facts = buildInstanceFromLiterals();
    const r = facts.requests[0];
    const input = createPlanSchema.parse({
      planningNight: facts.planningNight,
      locked: [
        {
          requestId: r.id,
          teamId: r.teamId,
          startMinute: 0,
          endMinute: r.durationMinutes,
        },
      ],
    });
    const hash = planInputDigest(facts, input);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(
      planInputDigest({ ...facts, teams: [...facts.teams].reverse() }, input),
    ).toBe(hash);
    expect(
      planInputDigest(facts, {
        ...input,
        locked: [{ ...input.locked[0], teamId: "other" }],
      }),
    ).not.toBe(hash);
    expect(
      planInputDigest(facts, {
        ...input,
        locked: [{ ...input.locked[0], endMinute: 99 }],
      }),
    ).not.toBe(hash);
    expect(
      planInputDigest(
        {
          ...facts,
          equipment: facts.equipment.map((e, i) =>
            i ? e : { ...e, units: e.units + 1 },
          ),
        },
        input,
      ),
    ).not.toBe(hash);
  });
});
