// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { buildWorld } from "@railplan/core/domain/world";
import { validate } from "@railplan/core/engine/validate";
import { solvePreview, reviewRequestedConflicts, previewConflictRepair } from "@/lib/plans/analysis";
import { analysisSchema, createPlanSchema } from "@/lib/plans/schemas";
import { planInputDigest } from "@/lib/plans/input";
import { parseOverviewQuery } from "@/lib/plans/overview";
describe("connected planner bounded analysis", () => {
  it("groups requested-time findings and previews a repair without mutating saved facts or pins", () => {
    const facts = buildInstanceFromLiterals();
    const parameters = { planningNight: facts.planningNight, strategy: "balanced" as const, locked: [] };
    const original = JSON.stringify({ facts, parameters });
    const groups = reviewRequestedConflicts(facts, parameters);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.flatMap(group => group.violations).length).toBeGreaterThan(groups.length);
    let repaired = false;
    for (const group of groups) {
      try {
        const proposal = previewConflictRepair(facts, parameters, group.primary.id);
        expect(proposal.result.independentlyValidated).toBe(true);
        expect(proposal.result.violations).toEqual(validate(proposal.result.plan, { world: buildWorld(facts) }));
        expect(proposal.parameters.locked).toHaveLength(1);
        expect(proposal.result.plan.placements).toContainEqual(proposal.parameters.locked[0]);
        repaired = true;
        break;
      } catch (error) {
        expect(error).toMatchObject({ code: "invalid_request" });
      }
    }
    expect(repaired).toBe(true);
    expect(JSON.stringify({ facts, parameters })).toBe(original);
    expect(() => previewConflictRepair(facts, parameters, "foreign-finding")).toThrow();
  });
  it("accepts bounded server conflict commands and rejects client-supplied recommendations", () => {
    expect(analysisSchema.safeParse({ operation: "conflicts", strategy: "balanced" }).success).toBe(true);
    expect(analysisSchema.safeParse({ operation: "repair", strategy: "balanced", violationId: "v1" }).success).toBe(true);
    expect(analysisSchema.safeParse({ operation: "repair", strategy: "balanced", violationId: "v1", resolution: {} }).success).toBe(false);
  });
  it("independently validates all objectives on the supplied facts and preserves pins", () => {
    const facts = buildInstanceFromLiterals();
    const first = solvePreview(facts, {
      planningNight: facts.planningNight,
      strategy: "balanced",
      locked: [],
    });
    const locked = [{ ...first.plan.placements[0], locked: true }];
    for (const strategy of [
      "balanced",
      "max-completion",
      "min-risk",
      "min-changes",
      "emergency-buffer",
    ] as const) {
      const result = solvePreview(facts, {
        planningNight: facts.planningNight,
        strategy,
        locked,
      });
      expect(result.plan.placements).toContainEqual(locked[0]);
      expect(result.violations).toEqual(
        validate(result.plan, { world: buildWorld(facts) }),
      );
    }
  });
  it("fails closed for unsupported workloads and invalid pins", () => {
    const facts = buildInstanceFromLiterals();
    const parameters = {
      planningNight: facts.planningNight,
      strategy: "balanced" as const,
      locked: [],
    };
    expect(() =>
      solvePreview(
        { ...facts, window: { ...facts.window, slotMinutes: 1 } },
        parameters,
      ),
    ).toThrow();
    expect(() =>
      solvePreview(facts, {
        ...parameters,
        locked: [
          {
            requestId: "foreign",
            locked: true,
            teamId: "fake",
            startMinute: 0,
            endMinute: 1,
          },
        ],
      }),
    ).toThrow();
  });
  it("keeps preview save guards outside canonical persisted parameter digests", () => {
    const facts = buildInstanceFromLiterals();
    const parameters = createPlanSchema.parse({
      planningNight: facts.planningNight,
    });
    const digest = planInputDigest(facts, parameters);
    expect(
      planInputDigest(facts, {
        ...parameters,
        expectedBasis: {
          planId: "fd8d3e80-c056-4ab2-a6b4-2f76c569b665",
          sourceRevision: "1",
          solverVersion: "engine",
          constraintVersion: "rules",
          inputDigest: digest,
        },
      }),
    ).toBe(digest);
    expect(
      planInputDigest(facts, { ...parameters, strategy: "min-risk" }),
    ).not.toBe(digest);
  });
  it("rejects forged results, unknown operations and unsupported query fields", () => {
    for (const body of [
      { operation: "inspect" },
      { operation: "preview", strategy: "balanced", facts: {} },
      { operation: "compare-objectives", strategy: "balanced" },
      {
        operation: "preview",
        strategy: "balanced",
        locked: Array(101).fill({}),
      },
    ])
      expect(analysisSchema.safeParse(body).success).toBe(false);
    expect(
      analysisSchema.parse({ operation: "inspect", requestId: "M-001" }),
    ).toEqual({ operation: "inspect", requestId: "M-001" });
    for (const query of [
      "?planningNight=2026-08-03&planningNight=2026-08-03",
      "?owner=x",
      "?cursor=%%%",
      "?planningNight=bad",
    ])
      expect(() => parseOverviewQuery("http://localhost/" + query)).toThrow();
  });
});
