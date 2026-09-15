import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import type { RequestCatalogue, RequestSubmission } from "@railplan/core/types/requests";
import type { PlanVersion } from "@railplan/core/types/plans";
import type { CoordinationActionResult, CoordinationCasePage, PlannerCoordinationCase, ContractorCoordinationCase } from "@railplan/core/types/coordination";
import type { E2EFixture } from "./fixtures";

interface Session {
  request(path: string, options?: RequestInit): Promise<Response>;
  json<T>(path: string, method?: string, body?: unknown, expected?: number): Promise<T>;
}

export async function coordinationJourney(f: E2EFixture, planner: Session, a: Session, b: Session) {
  const { catalogue } = await a.json<{ catalogue: RequestCatalogue }>("/api/requests/catalogue");
  const requests: RequestSubmission[] = [];
  for (const [i, contractor] of [a, b].entries()) {
    const { request: draft } = await contractor.json<{ request: RequestSubmission }>("/api/requests", "POST", { fields: { planningNight: f.night, title: `Isolated organisation ${i + 1} coordination`, description: "Fabricated shared-block review", workClass: "civil", blockIds: ["NS10-NS11"], durationMinutes: 15, preferredStart: 30, earliestStart: 0, latestEnd: 240, equipment: [], workforce: [{ roleId: catalogue.roles[0].id, count: 1 }] } }, 201);
    await contractor.json(`/api/requests/${draft.id}/actions`, "POST", { action: "submit", expectedVersion: 1, reason: "" });
    const { request } = await planner.json<{ request: RequestSubmission }>(`/api/requests/${draft.id}/actions`, "POST", { action: "approve", expectedVersion: 2, reason: "Reviewed fabricated request", approval: { teamId: "T-TRK", priority: "low", clearanceMinutes: 0, requiredSkills: [], dependencies: [], dependencyLagMinutes: 0, safetyConfirmed: true } });
    requests.push(request);
  }
  const parameters = { planningNight: f.night, strategy: "balanced", locked: requests.map((r, i) => ({ requestId: "R-" + r.id, teamId: "T-TRK", startMinute: 120 + i * 30, endMinute: 135 + i * 30 })) };
  const { plan: source } = await planner.json<{ plan: PlanVersion }>("/api/plans", "POST", { ...parameters, locked: [] }, 201);
  const body = { sourcePlanId: source.id, selectedRequestIds: ["R-" + requests[0].id], idempotencyKey: randomUUID(), parameters };
  let { case: current } = await planner.json<{ case: PlannerCoordinationCase }>("/api/coordination", "POST", body, 201);
  expect(current.ownerId).toBe(f.users[0].id);
  expect(current.changes.map(c => c.requestId).sort()).toEqual(requests.map(r => "R-" + r.id).sort());
  expect(current.confirmations.map(c => c.status)).toEqual(["pending", "pending"]);
  expect((await planner.json<{ case: PlannerCoordinationCase }>("/api/coordination", "POST", body, 201)).case.id).toBe(current.id);
  const id = current.id;
  const applyBody = { action: "apply", expectedVersion: current.version, revision: 1, idempotencyKey: randomUUID() };
  const applied = await planner.json<CoordinationActionResult>(`/api/coordination/${id}/actions`, "POST", applyBody);
  current = applied.case as PlannerCoordinationCase;
  expect(applied.appliedPlanId).toBeTruthy();
  const { plan } = await planner.json<{ plan: PlanVersion }>(`/api/plans/${applied.appliedPlanId}`);
  expect(plan.publishState).toBe("draft");
  expect(plan.placements.map(p => p.startMinute).sort((x, y) => x - y)).toEqual([120, 150]);
  expect(current.confirmations.every(c => c.status === "pending")).toBe(true);
  current = (await planner.json<CoordinationActionResult>(`/api/coordination/${id}/actions`, "POST", { action: "approve", expectedVersion: current.version, revision: 1, organisationId: f.orgs[0], confirmedAt: "2026-09-14T00:00:00Z", note: "PRIVATE_PLANNER_CONFIRMATION_NOTE" })).case as PlannerCoordinationCase;
  expect(current.confirmations.find(c => c.organisationId === f.orgs[0])?.status).toBe("approved");
  expect(current.confirmations.find(c => c.organisationId === f.orgs[1])?.status).toBe("pending");
  for (const [i, contractor] of [a, b].entries()) {
    const { case: scoped } = await contractor.json<{ case: ContractorCoordinationCase }>(`/api/coordination/${id}`);
    expect(scoped.scope).toBe("contractor");
    expect(scoped.changes.map(c => c.requestId)).toEqual(["R-" + requests[i].id]);
    expect(scoped.confirmations).toHaveLength(1);
    const serialized = JSON.stringify(scoped);
    for (const forbidden of [requests[1 - i].id, f.orgs[1 - i], "PRIVATE_PLANNER_CONFIRMATION_NOTE", source.id, "sourceDigest", "events", "proposals"]) expect(serialized).not.toContain(forbidden);
    const list = await contractor.json<CoordinationCasePage>(`/api/coordination?planningNight=${f.night}`);
    expect(list.cases.map(c => c.id)).toContain(id);
    expect(JSON.stringify(list)).not.toContain(requests[1 - i].id);
    expect((await contractor.request(`/api/plans/${plan.id}`)).status).toBe(403);
  }
  // A-only case is also denied through a guessed exact UUID, not just a list.
  const solo = (await planner.json<{ case: PlannerCoordinationCase }>("/api/coordination", "POST", { sourcePlanId: plan.id, selectedRequestIds: ["R-" + requests[0].id], idempotencyKey: randomUUID(), parameters: { ...parameters, locked: parameters.locked.map((p, i) => i === 0 ? { ...p, startMinute: 180, endMinute: 195 } : p) } }, 201)).case;
  expect((await b.request(`/api/coordination/${solo.id}`)).status).toBe(404);
  expect((await b.json<CoordinationCasePage>(`/api/coordination?planningNight=${f.night}`)).cases.map(c => c.id)).not.toContain(solo.id);
  current = (await b.json<CoordinationActionResult>(`/api/coordination/${id}/actions`, "POST", { action: "request-changes", expectedVersion: current.version, revision: 1, note: "B asks for another time" })).case as PlannerCoordinationCase;
  const plannerView = (await planner.json<{ case: PlannerCoordinationCase }>(`/api/coordination/${id}`)).case;
  expect(plannerView.events.some(e => e.action === "request-changes" && e.note === "B asks for another time")).toBe(true);
  current = (await planner.json<CoordinationActionResult>(`/api/coordination/${id}/actions`, "POST", { action: "revise", expectedVersion: current.version, sourcePlanId: source.id, parameters })).case as PlannerCoordinationCase;
  expect(current.currentRevision).toBe(2);
  expect(current.confirmations.every(c => c.revision === 2 && c.status === "pending")).toBe(true);
  expect(current.events.filter(e => e.action === "approve").map(e => e.revision)).toEqual([1]);
  const historical = await planner.json<CoordinationCasePage>(`/api/coordination?appliedPlanId=${plan.id}`);
  expect(historical.cases[0]).toMatchObject({ viewedRevision: 1, currentRevision: 2 });
  expect(historical.cases[0].confirmations.map(c => c.status).sort()).toEqual(["approved", "changes-requested"]);
  expect((await planner.json<CoordinationActionResult>(`/api/coordination/${id}/actions`, "POST", applyBody)).appliedPlanId).toBe(plan.id);
  current = (await planner.json<CoordinationActionResult>(`/api/coordination/${id}/actions`, "POST", { action: "close", expectedVersion: current.version, note: "Close without claiming organisation agreement" })).case as PlannerCoordinationCase;
  expect(current.state).toBe("closed");
  expect(current.confirmations.every(c => c.status === "pending")).toBe(true);
  const closedSummary = await planner.json<CoordinationCasePage>(`/api/coordination?appliedPlanId=${plan.id}`);
  expect(closedSummary.cases[0]).toMatchObject({ state: "closed", viewedRevision: 1, currentRevision: 2 });
  expect(closedSummary.cases[0].confirmations.map(c => c.status).sort()).toEqual(["approved", "changes-requested"]);
  // Closing/revision do not gate publication of the reviewed valid saved version.
  expect((await planner.json<{ plan: PlanVersion }>(`/api/plans/${plan.id}/publish`, "POST", {})).plan.publishState).toBe("published");
  return { caseId: id, sourcePlanId: source.id, appliedPlanId: plan.id, requestIds: requests.map(r => r.id) };
}
