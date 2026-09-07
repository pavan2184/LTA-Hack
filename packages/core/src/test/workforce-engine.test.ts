import { describe, expect, it } from "vitest";
import { buildInstanceFromLiterals } from "../domain/instance";
import { buildWorld } from "../domain/world";
import { validate, type ValidationContext } from "../engine/validate";
import { computeMetrics } from "../engine/metrics";
import { solve } from "../engine/solve";
import { applyAlternative, findAlternatives } from "../engine/alternatives";
import { recommendResolution, repairPlan } from "../engine/resolutions";
import { buildDisruptionInputs, disruptionById } from "../data/disruptions";
import type { Plan, Placement } from "../types/railplan";

const base = buildInstanceFromLiterals();
function fixture(
  availability = [{ startMinute: 0, endMinute: 240, count: 3 }],
) {
  const requests = ["A", "B"].map((id, index) => ({
    ...base.requests[0],
    id,
    teamId: "T-PWR",
    blockIds: [base.blocks[index * 3].id],
    equipment: [],
    requiredSkills: [],
    workClass: "civil" as const,
    earliestStart: 0,
    latestEnd: 240,
    preferredStart: 0,
    durationMinutes: 30,
    clearanceMinutes: 0,
    dependencies: [],
    mandatory: true,
  }));
  const world = buildWorld({
    ...base,
    requests,
    conflictZones: [],
    workforceRoles: [
      { id: "tech", name: "Technician" },
      { id: "lead", name: "Lead" },
    ],
    workforceAvailability: availability.map((row) => ({
      ...row,
      planningNight: base.planningNight,
      teamId: "T-PWR",
      roleId: "tech",
    })),
    workforceDemand: requests.map((request) => ({
      requestId: request.id,
      roleId: "tech",
      count: 2,
    })),
  });
  return { world } satisfies ValidationContext;
}
function placement(
  requestId = "A",
  startMinute = 0,
  endMinute = startMinute + 30,
): Placement {
  return { requestId, startMinute, endMinute, teamId: "T-PWR", locked: false };
}
const plan = (...placements: Placement[]): Plan => ({
  placements,
  deferred: [],
});
const shortages = (p: Plan, context: ValidationContext) =>
  validate(p, context).filter((v) => v.ruleId === "WORKFORCE_CAPACITY");
const metrics = (p: Plan, context: ValidationContext) =>
  computeMetrics(p, validate(p, context), context.world!.requests, context);

describe("aggregate workforce capacity", () => {
  it("counts simultaneous people independently of concurrent crew capacity", () => {
    const context = fixture();
    const p = plan(placement(), placement("B", 15));
    expect(validate(p, context).some((v) => v.ruleId === "TEAM_CAPACITY")).toBe(
      false,
    );
    expect(shortages(p, context)).toMatchObject([
      {
        requestIds: ["A", "B"],
        severity: "critical",
        window: { start: 15, end: 30 },
        workforce: {
          teamId: "T-PWR",
          roleId: "tech",
          demand: 4,
          available: 3,
          shortfall: 1,
        },
        shortfallMinutes: 15,
      },
    ]);
    expect(shortages(p, context)[0].remedy).toMatch(/1.*Technician/);
  });
  it("does not charge clearance or touching endpoints as simultaneous demand", () => {
    const context = fixture([{ startMinute: 0, endMinute: 240, count: 2 }]);
    context.world = buildWorld({
      ...context.world.instance,
      requests: context.world.requests.map((request) => ({
        ...request,
        clearanceMinutes: 15,
      })),
    });
    expect(shortages(plan(placement(), placement("B", 30)), context)).toEqual(
      [],
    );
  });
  it("preserves each supply change and role as its own exact finding", () => {
    const context = fixture([
      { startMinute: 0, endMinute: 10, count: 2 },
      { startMinute: 10, endMinute: 20, count: 1 },
    ]);
    context.world = buildWorld({
      ...context.world.instance,
      workforceDemand: [
        ...context.world.instance.workforceDemand,
        { requestId: "A", roleId: "lead", count: 1 },
      ],
    });
    const found = shortages(plan(placement()), context);
    expect(found).toHaveLength(3);
    expect(found).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          window: { start: 10, end: 20 },
          workforce: {
            teamId: "T-PWR",
            roleId: "tech",
            demand: 2,
            available: 1,
            shortfall: 1,
          },
        }),
        expect.objectContaining({
          window: { start: 20, end: 30 },
          workforce: {
            teamId: "T-PWR",
            roleId: "tech",
            demand: 2,
            available: 0,
            shortfall: 2,
          },
        }),
        expect.objectContaining({
          window: { start: 0, end: 30 },
          workforce: {
            teamId: "T-PWR",
            roleId: "lead",
            demand: 1,
            available: 0,
            shortfall: 1,
          },
        }),
      ]),
    );
  });
  it("keeps changing contributing requests separate even at equal headcount", () => {
    const context = fixture([{ startMinute: 0, endMinute: 240, count: 1 }]);
    const found = shortages(plan(placement(), placement("B", 30)), context);
    expect(found).toHaveLength(2);
    expect(found.map((v) => v.requestIds)).toEqual([["A"], ["B"]]);
  });
  it("fails closed for baseline and extra requests without staffing definitions", () => {
    const context = fixture();
    context.world = buildWorld({
      ...context.world.instance,
      workforceDemand: [],
    });
    expect(shortages(plan(placement()), context)[0]).toMatchObject({
      workforce: { demand: null },
      remedy: expect.stringMatching(/demand/i),
    });
    const extra = { ...context.world.requests[0], id: "EXTRA" };
    expect(
      shortages(plan(placement("EXTRA")), {
        ...context,
        extraRequests: { EXTRA: extra },
      }),
    ).toHaveLength(1);
  });
  it("uses explicit extra demand and reports a mandatory custom request blocked by staffing", () => {
    const context = fixture([{ startMinute: 0, endMinute: 240, count: 1 }]);
    const extra = { ...context.world.requests[0], id: "EXTRA" };
    const result = solve({
      strategy: "balanced",
      requests: [extra],
      context: {
        ...context,
        extraRequests: { EXTRA: extra },
        extraWorkforceDemand: [
          { requestId: "EXTRA", roleId: "tech", count: 2 },
        ],
      },
    });
    expect(result.status).toBe("INFEASIBLE");
    expect(result.plan.deferred[0].bindingRuleIds).toContain(
      "WORKFORCE_CAPACITY",
    );
  });
  it("moves work to declared availability and independently verifies every strategy", () => {
    const context = fixture([{ startMinute: 60, endMinute: 240, count: 2 }]);
    for (const strategy of [
      "balanced",
      "min-risk",
      "max-completion",
      "min-changes",
      "emergency-buffer",
    ] as const) {
      const result = solve({ strategy, context });
      expect(result.status).not.toBe("INFEASIBLE");
      expect(result.plan.placements.every((p) => p.startMinute >= 60)).toBe(
        true,
      );
      expect(shortages(result.plan, context)).toEqual([]);
      expect(result.metrics.workforceShortageIntervals.value).toBe(0);
    }
  });
  it("reports impossible mandatory staffing and conflicting pins honestly", () => {
    const context = fixture([]);
    const result = solve({ strategy: "balanced", context });
    expect(result.status).toBe("INFEASIBLE");
    expect(
      result.plan.deferred.every((d) =>
        d.bindingRuleIds.includes("WORKFORCE_CAPACITY"),
      ),
    ).toBe(true);
    const pinned = solve({
      strategy: "balanced",
      context,
      locked: [placement()],
    });
    expect(pinned.status).toBe("INFEASIBLE");
    expect(pinned.independentlyValidated).toBe(false);
    expect(pinned.metrics.workforceShortageIntervals.value).toBe(1);
  });
  it("repairs shortages with a validated move and offers only staffed alternatives", () => {
    const context = fixture([{ startMinute: 60, endMinute: 240, count: 2 }]);
    const p = plan(placement());
    const fix = recommendResolution(p, shortages(p, context)[0], context)!;
    expect(fix.toMinute).toBe(60);
    expect(repairPlan(p, context).remaining).toEqual([]);
    const alternatives = findAlternatives(p, "A", context).alternatives;
    expect(alternatives.length).toBeGreaterThan(0);
    for (const alternative of alternatives) {
      expect(alternative.startMinute).toBeGreaterThanOrEqual(60);
      const applied = applyAlternative(
        p,
        "A",
        alternative.startMinute,
        context,
      );
      expect(applied.feasible).toBe(true);
      expect(
        metrics(applied.plan, context).workforceShortageIntervals.value,
      ).toBe(0);
    }
  });
  it("does not move a locked shortage during automatic repair", () => {
    const context = fixture([{ startMinute: 60, endMinute: 240, count: 2 }]);
    const p = plan({ ...placement(), locked: true });
    expect(repairPlan(p, context).moves).toEqual([]);
    expect(repairPlan(p, context).remaining).toHaveLength(1);
  });
  it("counts exact person-minutes and shortage segments with provenance", () => {
    const context = fixture([
      { startMinute: 0, endMinute: 20, count: 2 },
      { startMinute: 20, endMinute: 40, count: 1 },
    ]);
    const values = metrics(plan(placement()), context);
    expect(values.workforceUtilisation).toMatchObject({
      numerator: 60,
      denominator: 60,
      value: 100,
      unit: "percent",
      formula: expect.stringMatching(/person-minutes/),
    });
    expect(values.workforceShortageIntervals).toMatchObject({
      numerator: 1,
      denominator: 2,
      value: 1,
      unit: "count",
      formula: expect.stringMatching(/intervals/),
    });
  });
  it("recomputes supply and shortages for crew outage, overrun and shortened window", () => {
    const context = fixture([{ startMinute: 0, endMinute: 240, count: 2 }]);
    const p = plan(placement());
    const outage = {
      ...context,
      unavailableTeams: [{ teamId: "T-PWR", fromMinute: 15 }],
    };
    expect(metrics(p, outage).workforceUtilisation).toMatchObject({
      numerator: 60,
      denominator: 30,
      value: 200,
    });
    expect(shortages(p, outage)[0].window).toEqual({ start: 15, end: 30 });
    expect(
      metrics(p, { ...context, overrun: { requestId: "A", minutes: 15 } })
        .workforceUtilisation.numerator,
    ).toBe(90);
    expect(
      metrics(p, { ...context, windowEnd: 60 }).workforceUtilisation
        .denominator,
    ).toBe(120);
  });

  it("validates emergency alternatives with their explicit staffing demand", () => {
    const context = fixture([{ startMinute: 60, endMinute: 240, count: 2 }]);
    const extra = { ...context.world.requests[0], id: "EXTRA" };
    const scoped = {
      ...context,
      extraRequests: { EXTRA: extra },
      extraWorkforceDemand: [{ requestId: "EXTRA", roleId: "tech", count: 2 }],
    };
    const p = plan(placement("EXTRA"));
    expect(
      findAlternatives(p, "EXTRA", scoped).alternatives[0]?.startMinute,
    ).toBe(60);
    const applied = applyAlternative(p, "EXTRA", 60, scoped);
    expect(applied.plan.placements[0].startMinute).toBe(60);
    expect(applied.violations).toEqual([]);
  });
  it("uses the assigned team supply and excludes off-shift supply", () => {
    const context = fixture([{ startMinute: 0, endMinute: 240, count: 2 }]);
    expect(
      shortages(plan({ ...placement(), teamId: "T-TRK" }), context)[0].workforce
        ?.available,
    ).toBe(0);
    context.world = buildWorld({
      ...context.world.instance,
      teams: context.world.instance.teams.map((team) =>
        team.id === "T-PWR" ? { ...team, shiftStart: 15, shiftEnd: 45 } : team,
      ),
    });
    expect(
      metrics(plan(placement()), context).workforceUtilisation.denominator,
    ).toBe(60);
    expect(shortages(plan(placement()), context)[0].window).toEqual({
      start: 0,
      end: 15,
    });
  });
  it("rejects ambiguous absolute availability and invalid scenario role demand", () => {
    const context = fixture([
      { startMinute: 0, endMinute: 30, count: 2 },
      { startMinute: 15, endMinute: 60, count: 2 },
    ]);
    expect(() => validate(plan(placement()), context)).toThrow(/overlapping/i);
    const valid = fixture();
    for (const count of [0, -1, 0.5, Number.NaN]) {
      expect(
        shortages(plan(placement()), {
          ...valid,
          extraWorkforceDemand: [{ requestId: "A", roleId: "tech", count }],
        })[0].workforce?.demand,
      ).toBeNull();
    }
    expect(
      shortages(plan(placement()), {
        ...valid,
        extraWorkforceDemand: [{ requestId: "A", roleId: "unknown", count: 2 }],
      })[0].workforce?.demand,
    ).toBeNull();
  });
  it("recalculates a planner lock and fingerprints a change in scenario demand", () => {
    const context = fixture([{ startMinute: 0, endMinute: 240, count: 2 }]);
    const locked = [placement()];
    const first = solve({ strategy: "balanced", context, locked });
    const second = solve({
      strategy: "balanced",
      context: {
        ...context,
        extraWorkforceDemand: [{ requestId: "A", roleId: "tech", count: 3 }],
      },
      locked,
    });
    expect(first.metrics.workforceShortageIntervals.value).toBe(0);
    expect(second.metrics.workforceShortageIntervals.value).toBeGreaterThan(0);
    expect(second.inputHash).not.toBe(first.inputHash);
    expect(second.status).toBe("INFEASIBLE");
  });
  it("rejects an unknown alternative request and preserves real staffing findings", () => {
    const context = fixture([]);
    const current = plan(placement());
    const result = applyAlternative(current, "UNKNOWN", 60, context);
    expect(result.feasible).toBe(false);
    expect(result.plan).toBe(current);
    expect(result.violations).toMatchObject([
      { ruleId: "WORKFORCE_CAPACITY", severity: "critical", requestIds: ["A"] },
    ]);
    expect(applyAlternative(plan(), "UNKNOWN", 60, context).feasible).toBe(false);
  });
  it("includes fabricated emergency staffing in disruption inputs and capacity probes", () => {
    const inputs = buildDisruptionInputs(disruptionById["track-fault"], []);
    expect(inputs.context.extraWorkforceDemand?.length).toBeGreaterThan(0);
    const world = buildWorld({
      ...base,
      workforceAvailability: base.workforceAvailability.filter(
        (row) => row.teamId !== "T-RRT",
      ),
    });
    const empty = plan();
    expect(
      computeMetrics(empty, [], world.requests, { world }).emergencyCapacity
        .value,
    ).toBe(0);
  });
});
