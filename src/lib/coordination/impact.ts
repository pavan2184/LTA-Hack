import { createHash } from "node:crypto";
import { stableStringify } from "@railplan/core/engine/hash";
import type { Plan, SolveResult } from "@railplan/core/types/railplan";
import type { CoordinationChange, OrganisationConfirmation } from "@railplan/core/types/coordination";

export function coordinationDigest(value: unknown): string {
  return "sha256:" + createHash("sha256").update(stableStringify(value)).digest("hex");
}
export function semanticResultDigest(result: SolveResult): string {
  const { solveMs: _timing, ...semantic } = result;
  void _timing;
  return coordinationDigest(semantic);
}
export function deriveChanges(before: Plan, after: Plan, owners: { requestId: string; organisationId: string; submissionRevision: number }[]): CoordinationChange[] {
  const ids = [...new Set([...before.placements, ...before.deferred, ...after.placements, ...after.deferred].map(p => p.requestId))].sort();
  return ids.flatMap(requestId => {
    const b = before.placements.find(p => p.requestId === requestId) ?? null;
    const a = after.placements.find(p => p.requestId === requestId) ?? null;
    const bd = before.deferred.find(p => p.requestId === requestId) ?? null;
    const ad = after.deferred.find(p => p.requestId === requestId) ?? null;
    if (stableStringify([b, bd]) === stableStringify([a, ad])) return [];
    const owner = owners.find(o => o.requestId === requestId);
    return [{ requestId, organisationId: owner?.organisationId ?? null, submissionRevision: owner?.submissionRevision ?? null, kind: a && !b ? "scheduled" as const : ad && !bd ? "deferred" as const : !a && !ad ? "removed" as const : "changed" as const, before: b, after: a, beforeDeferral: bd, afterDeferral: ad }];
  });
}
export function projectOrganisationChanges(changes: CoordinationChange[], organisationId: string): CoordinationChange[] {
  return changes.filter(c => c.organisationId === organisationId);
}
export function confirmationsForRevision(events: OrganisationConfirmation[], revision: number, organisationIds: string[]): OrganisationConfirmation[] {
  return [...new Set(organisationIds)].sort().map(organisationId => events.filter(e => e.revision === revision && e.organisationId === organisationId).at(-1) ?? { organisationId, revision, status: "pending" });
}
