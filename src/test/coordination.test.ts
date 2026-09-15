// @vitest-environment node
import { describe, expect, it } from "vitest";
import { deriveChanges, projectOrganisationChanges, confirmationsForRevision, semanticResultDigest } from "@/lib/coordination/impact";
import { createCaseSchema, caseActionSchema, caseFiltersSchema } from "@/lib/coordination/schemas";
import type { CoordinationChange } from "@railplan/core/types/coordination";
import { solve } from "@railplan/core/engine/solve";

describe("coordination impact and revision boundaries", () => {
  it("includes removed placements, newly scheduled work and changed deferrals across the whole plan", () => {
    const placement = (requestId: string, startMinute = 0) => ({ requestId, teamId: "T-TRK", startMinute, endMinute: startMinute + 30, locked: false });
    const changes = deriveChanges(
      { placements: [placement("R-a"), placement("M-001")], deferred: [{ requestId: "R-b", reason: "No slot", bindingRuleIds: [] }] },
      { placements: [placement("R-b"), placement("M-001", 30)], deferred: [{ requestId: "R-a", reason: "Capacity", bindingRuleIds: [] }] },
      [{ requestId: "R-a", organisationId: "org-a", submissionRevision: 1 }, { requestId: "R-b", organisationId: "org-b", submissionRevision: 2 }],
    );
    expect(changes.map(({ requestId, kind, organisationId }) => ({ requestId, kind, organisationId }))).toEqual([
      { requestId: "M-001", kind: "changed", organisationId: null },
      { requestId: "R-a", kind: "deferred", organisationId: "org-a" },
      { requestId: "R-b", kind: "scheduled", organisationId: "org-b" },
    ]);
  });
  it("projects literal changes to exactly the owning organisation", () => {
    const changes: CoordinationChange[] = [
      { requestId: "R-a", organisationId: "org-a", submissionRevision: 1, kind: "removed", before: null, after: null, beforeDeferral: null, afterDeferral: null },
      { requestId: "R-b", organisationId: "org-b", submissionRevision: 2, kind: "removed", before: null, after: null, beforeDeferral: null, afterDeferral: null },
    ];
    expect(projectOrganisationChanges(changes, "org-a").map(x => x.requestId)).toEqual(["R-a"]);
  });
  it("does not inherit confirmation from another proposal revision", () => {
    expect(confirmationsForRevision([{ organisationId: "org-a", revision: 1, status: "approved" }], 2, ["org-a"])).toEqual([{ organisationId: "org-a", revision: 2, status: "pending" }]);
  });
  it("excludes elapsed timing but detects a different reviewed placement", () => {
    const result = solve({ strategy: "balanced" });
    expect(semanticResultDigest({ ...result, solveMs: 999 })).toBe(semanticResultDigest(result));
    const changed = structuredClone(result);
    changed.plan.placements[0].startMinute += 1;
    expect(semanticResultDigest(changed)).not.toBe(semanticResultDigest(result));
  });
  it("rejects untrusted participants, actors, outputs and unbounded mutation inputs", () => {
    const input = { sourcePlanId: "00000000-0000-4000-8000-000000000001", selectedRequestIds: ["M-001"], idempotencyKey: "00000000-0000-4000-8000-000000000002", parameters: { planningNight: "2026-09-15", strategy: "balanced", locked: [] } };
    expect(createCaseSchema.safeParse(input).success).toBe(true);
    for (const extra of [{ participants: [] }, { actorId: input.sourcePlanId }, { result: {} }]) expect(createCaseSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    expect(createCaseSchema.safeParse({ ...input, selectedRequestIds: Array(101).fill("M-001") }).success).toBe(false);
    expect(caseActionSchema.safeParse({ action: "approve", expectedVersion: 1, revision: 1, organisationId: input.sourcePlanId, confirmedAt: "2026-09-15T01:00:00Z", note: " " }).success).toBe(false);
    expect(caseActionSchema.safeParse({ action: "apply", revision: 1 }).success).toBe(false);
    expect(caseFiltersSchema.safeParse({ limit: 51 }).success).toBe(false);
  });
});
