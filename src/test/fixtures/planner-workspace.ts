import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { solve } from "@railplan/core/engine/solve";
import { makePlanExport } from "@/lib/exports/serialize";
import type { PlanVersion } from "@railplan/core/types/plans";
import type { PlannerOverview } from "@/lib/plans/workspace-types";
export const plannerFacts = buildInstanceFromLiterals();
export const plannerResult = solve({ strategy: "balanced" });
export function plannerVersion(overrides: Partial<PlanVersion> = {}): PlanVersion {
  return { ...plannerResult.plan, id: "6c494154-2b92-4890-8b8a-8a522254fe42", planningNight: plannerFacts.planningNight, sourceRevision: "1", inputDigest: "sha256:test", strategy: "balanced", solverVersion: plannerResult.solverVersion, constraintVersion: plannerResult.constraintVersion, status: plannerResult.status, objectives: plannerResult.objective, metrics: plannerResult.metrics, validation: { independentlyValidated: true, violations: [] }, createdBy: "planner", createdAt: "2026-09-07T07:30:00Z", publishState: "draft", publishedAt: null, supersededBy: null, ...overrides };
}
export function plannerExport(version = plannerVersion()) {
  return makePlanExport({ id: version.id, planningNight: version.planningNight, sourceRevision: version.sourceRevision, currentSourceRevision: version.sourceRevision, inputDigest: version.inputDigest, facts: { ...plannerFacts, planningNight: version.planningNight }, parameters: { planningNight: version.planningNight, strategy: version.strategy, locked: [] }, result: { ...plannerResult, plan: { placements: version.placements, deferred: version.deferred }, metrics: version.metrics, status: version.status }, createdBy: version.createdBy, createdAt: version.createdAt, publishedAt: version.publishedAt, supersededBy: version.supersededBy });
}
export function plannerOverview(versions: PlanVersion[] = [], overrides: Partial<PlannerOverview> = {}) {
  return { overview: { nights: [{ planningNight: plannerFacts.planningNight, startMinute: 0, endMinute: 240 }, { planningNight: "2026-09-17", startMinute: 0, endMinute: 240 }], planningNight: plannerFacts.planningNight, sourceRevision: "1", pendingCount: 0, currentPublication: versions.find((v) => v.publishState === "published") ?? null, versions, nextCursor: null, ...overrides } };
}
export function plannerInspection(url: string, init?: RequestInit) {
  const request = JSON.parse(String(init?.body));
  return Response.json({ operation: "inspect", requestId: request.requestId, basis: { planId: url.split("/")[3] }, explanation: { summary: "Saved placement validated against the engineering window.", blockers: [] }, alternatives: [], stale: false });
}
