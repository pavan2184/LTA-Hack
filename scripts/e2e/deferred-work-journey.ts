import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { RequestSubmission } from "@railplan/core/types/requests";
import type { PlannerWorkItem, ContractorWorkItem } from "@railplan/core/types/deferred-work";
import type { PlanVersion } from "@railplan/core/types/plans";
import type { PlannerCoordinationCase, CoordinationActionResult } from "@railplan/core/types/coordination";
import type { E2EFixture } from "./fixtures";
interface Session {
  json<T>(path: string, method?: string, body?: unknown, expected?: number): Promise<T>;
}
export async function deferredWorkJourney(f: E2EFixture, target: E2EFixture, planner: Session, contractor: Session, foreign: Session) {
  const approval = { teamId: "T-TRK", priority: "low", clearanceMinutes: 0, requiredSkills: [], dependencies: [], dependencyLagMinutes: 0, safetyConfirmed: true };
  const { request: source } = await contractor.json<{ request: RequestSubmission }>("/api/requests", "POST", { fields: { planningNight: f.night, title: "Carry reviewed inspection", description: "Fabricated deferred work", workClass: "civil", blockIds: ["NS10-NS11"], durationMinutes: 15, preferredStart: 0, earliestStart: 0, latestEnd: 240, equipment: [], workforce: [{ roleId: "technician", count: 10000 }] } }, 201);
  await contractor.json(`/api/requests/${source.id}/actions`, "POST", { action: "submit", expectedVersion: 1, reason: "" });
  await planner.json(`/api/requests/${source.id}/actions`, "POST", { action: "approve", expectedVersion: 2, reason: "Reviewed source", approval });
  const { plan: sourcePlan } = await planner.json<{ plan: PlanVersion }>("/api/plans", "POST", { planningNight: f.night }, 201);
  expect(sourcePlan.deferred.some(d => d.requestId === "R-" + source.id)).toBe(true);
  const record = { planId: sourcePlan.id, requestId: "R-" + source.id, reason: "PRIVATE_CARRY_SOURCE_NOTE", idempotencyKey: randomUUID() };
  const { workItem } = await planner.json<{ workItem: PlannerWorkItem }>("/api/deferred-work", "POST", record, 201);
  const prepare = { action: "prepare-carry-forward", expectedVersion: workItem.version, targetNight: target.night, idempotencyKey: randomUUID() };
  const prepared = await planner.json<{ requestId: string }>(`/api/deferred-work/${workItem.id}/actions`, "POST", prepare);
  expect((await planner.json<{ requestId: string }>(`/api/deferred-work/${workItem.id}/actions`, "POST", prepare)).requestId).toBe(prepared.requestId);
  const { request: draft } = await contractor.json<{ request: RequestSubmission }>(`/api/requests/${prepared.requestId}`);
  expect(draft.status).toBe("draft");
  expect(draft.carryForward).not.toHaveProperty("originalFields");
  const { plan: inert } = await planner.json<{ plan: PlanVersion }>("/api/plans", "POST", { planningNight: target.night }, 201);
  expect(inert.placements).toEqual([]);
  const { request: edited } = await contractor.json<{ request: RequestSubmission }>(`/api/requests/${draft.id}`, "PATCH", { expectedVersion: 1, fields: { ...draft.fields, workforce: [{ roleId: "technician", count: 1 }] } });
  const { request: submitted } = await contractor.json<{ request: RequestSubmission }>(`/api/requests/${draft.id}/actions`, "POST", { action: "submit", expectedVersion: edited.version, reason: "" });
  await planner.json(`/api/requests/${draft.id}/actions`, "POST", { action: "approve", expectedVersion: submitted.version, reason: "Missing carry review", approval }, 400);
  const { request: reviewed } = await planner.json<{ request: RequestSubmission }>(`/api/requests/${draft.id}`);
  await planner.json(`/api/requests/${draft.id}/actions`, "POST", { action: "approve", expectedVersion: reviewed.version, reason: "Reviewed target windows and dependencies", approval, carryForward: { expectedWorkVersion: reviewed.carryForward!.expectedWorkVersion, dependenciesReviewed: true } });
  expect((await planner.json<{ request: RequestSubmission }>(`/api/requests/${source.id}`)).request.activeApprovedRevision).toBeNull();
  const { plan: generated } = await planner.json<{ plan: PlanVersion }>("/api/plans", "POST", { planningNight: target.night }, 201);
  expect(generated.placements.some(p => p.requestId === "R-" + draft.id)).toBe(true);
  expect((await planner.json<{ workItem: PlannerWorkItem }>(`/api/deferred-work/${workItem.id}`)).workItem.state).toBe("open");
  const { case: pending } = await planner.json<{ case: PlannerCoordinationCase }>("/api/coordination", "POST", { sourcePlanId: generated.id, selectedRequestIds: ["R-" + draft.id], idempotencyKey: randomUUID(), parameters: { planningNight: target.night, strategy: "balanced", locked: [{ requestId: "R-" + draft.id, teamId: "T-TRK", startMinute: 120, endMinute: 135 }] } }, 201);
  const applied = await planner.json<CoordinationActionResult>(`/api/coordination/${pending.id}/actions`, "POST", { action: "apply", expectedVersion: pending.version, revision: 1, idempotencyKey: randomUUID() });
  expect(applied.case.confirmations.every(c => c.status === "pending")).toBe(true);
  await planner.json(`/api/plans/${applied.appliedPlanId}/publish`, "POST", {});
  expect((await planner.json<{ workItem: PlannerWorkItem }>(`/api/deferred-work/${workItem.id}`)).workItem.state).toBe("scheduled");
  const own = await contractor.json<{ workItem: ContractorWorkItem }>(`/api/deferred-work/${workItem.id}`);
  expect(own.workItem.scope).toBe("contractor");
  expect(JSON.stringify(own)).not.toContain("PRIVATE_CARRY_SOURCE_NOTE");
  await foreign.json(`/api/deferred-work/${workItem.id}`, "GET", undefined, 404);
  await foreign.json(`/api/requests/${draft.id}`, "GET", undefined, 404);
}
