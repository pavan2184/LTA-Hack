// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { connect } from "@/lib/db/client";
import { withAuthenticatedTransaction, type VerifiedIdentity } from "@/lib/auth/session";
import { createPlan } from "@/lib/plans/service";
import { createRequest, actOnRequest, getRequestCatalogue } from "@/lib/requests/service";
import { createCase, getCase, listCases, actOnCase } from "@/lib/coordination/service";
import { PLANNING_NIGHT } from "@railplan/core/data/requests";
const sql = connect();
const reachable = await sql`select 1`.then(
  () => true,
  () => false,
);
if (!reachable) console.warn("Coordination database tests skipped: database unavailable; test:db remains a required gate.");
afterAll(() => sql.end({ timeout: 1 }));
const parameters = { planningNight: PLANNING_NIGHT, strategy: "balanced" as const, locked: [] };
const rollback = new Error("rollback coordination fixtures");
const identity = (id: string) => ({ id }) as VerifiedIdentity;
async function fixture(work: (tx: TransactionSql, p: VerifiedIdentity, c: VerifiedIdentity, other: VerifiedIdentity, org: string, requestId: string) => Promise<void>) {
  await expect(sql.begin(async tx => {
    const p = randomUUID(), c = randomUUID(), other = randomUUID(), org = randomUUID(), otherOrg = randomUUID();
    await tx`insert into auth.users(id) values(${p}),(${c}),(${other})`;
    await tx`insert into public.contractor_organisations(id,name) values(${org},'Coordination rollback'),(${otherOrg},'Foreign rollback')`;
    await tx`insert into public.profiles(id,role,contractor_organisation_id) values(${p},'planner',null),(${c},'contractor',${org}),(${other},'contractor',${otherOrg})`;
    const catalogue = await getRequestCatalogue(identity(c), tx);
    const draft = await createRequest(identity(c), { fields: { planningNight: PLANNING_NIGHT, title: "Coordination inspection", description: "Inspect walkway", workClass: "civil", blockIds: ["NS10-NS11"], durationMinutes: 15, preferredStart: 15, earliestStart: 0, latestEnd: 240, equipment: [], workforce: [{ roleId: catalogue.roles[0].id, count: 1 }] } }, tx);
    await actOnRequest(identity(c), draft.id, { expectedVersion: 1, action: "submit", reason: "" }, tx);
    await actOnRequest(identity(p), draft.id, { expectedVersion: 2, action: "approve", reason: "Reviewed", approval: { teamId: "T-TRK", priority: "low", clearanceMinutes: 0, requiredSkills: [], dependencies: [], dependencyLagMinutes: 0, safetyConfirmed: true } }, tx);
    await work(tx, identity(p), identity(c), identity(other), org, "R-" + draft.id);
    throw rollback;
  })).rejects.toBe(rollback);
}
describe.skipIf(!reachable)("coordination authenticated rollback persistence", { timeout: 30000 }, () => {
  it("creates idempotently, applies with pending confirmations and replays exact Apply", async () => {
    await fixture(async (tx, p, _c, _other, org, requestId) => {
      const source = await createPlan(p, parameters, tx);
      const input = { sourcePlanId: source.id, selectedRequestIds: [requestId], idempotencyKey: randomUUID(), parameters: { ...parameters, locked: [{ requestId, teamId: "T-TRK", startMinute: 180, endMinute: 195 }] } };
      const created = await createCase(p, input, tx);
      expect(created.scope).toBe("planner");
      expect((await createCase(p, input, tx)).id).toBe(created.id);
      expect(created.confirmations).toEqual([{ organisationId: org, revision: 1, status: "pending" }]);
      const action = { action: "apply" as const, expectedVersion: 1, revision: 1, idempotencyKey: randomUUID() };
      const applied = await actOnCase(p, created.id, action, tx);
      expect(applied.appliedPlanId).toBeTruthy();
      expect(applied.case.confirmations.every(c => c.status === "pending")).toBe(true);
      await actOnCase(p, created.id, { action: "approve", expectedVersion: 2, revision: 1, organisationId: org, confirmedAt: "2026-09-14T00:00:00Z", note: "Meeting approved" }, tx);
      await actOnCase(p, created.id, { action: "revise", expectedVersion: 3, sourcePlanId: source.id, parameters: input.parameters }, tx);
      const exact = await listCases(p, { appliedPlanId: applied.appliedPlanId }, tx);
      expect(exact.cases[0]).toMatchObject({ currentRevision: 2, viewedRevision: 1, confirmations: [{ organisationId: org, revision: 1, status: "approved" }] });
      expect((await actOnCase(p, created.id, action, tx)).appliedPlanId).toBe(applied.appliedPlanId);
      expect((await listCases(p, {}, tx)).cases.map(c => c.id)).toContain(created.id);
      await expect(actOnCase(p, created.id, { ...action, idempotencyKey: randomUUID() }, tx)).rejects.toMatchObject({ code: "conflict" });
    });
  });
  it("isolates contractor changes and resets confirmations only on a new revision", async () => {
    await fixture(async (tx, p, c, other, org, requestId) => {
      const source = await createPlan(p, parameters, tx);
      const pin = { requestId, teamId: "T-TRK", startMinute: 180, endMinute: 195 };
      const created = await createCase(p, { sourcePlanId: source.id, selectedRequestIds: [requestId], idempotencyKey: randomUUID(), parameters: { ...parameters, locked: [pin] } }, tx);
      expect(created.confirmations).toEqual([{ organisationId: org, revision: 1, status: "pending" }]);
      const own = await getCase(c, created.id, tx);
      expect(own.scope).toBe("contractor");
      expect(own.changes.every(change => change.organisationId === org)).toBe(true);
      expect(own).not.toHaveProperty("proposals");
      expect(own).not.toHaveProperty("events");
      expect(JSON.stringify(own)).not.toMatch(/M-\d{3}/);
      await expect(getCase(other, created.id, tx)).rejects.toMatchObject({ code: "not_found" });
      expect((await listCases(other, {}, tx)).cases).toEqual([]);
      await actOnCase(c, created.id, { action: "request-changes", expectedVersion: 1, revision: 1, note: "Please review timing" }, tx);
      await expect(actOnCase(p, created.id, { action: "approve", expectedVersion: 1, revision: 1, organisationId: org, confirmedAt: "2026-09-14T00:00:00Z", note: "Meeting confirmed" }, tx)).rejects.toMatchObject({ code: "conflict" });
      await actOnCase(p, created.id, { action: "approve", expectedVersion: 2, revision: 1, organisationId: org, confirmedAt: "2026-09-14T00:00:00Z", note: "Meeting confirmed" }, tx);
      expect(JSON.stringify(await getCase(c, created.id, tx))).not.toContain("Meeting confirmed");
      const revised = await actOnCase(p, created.id, { action: "revise", expectedVersion: 3, sourcePlanId: source.id, parameters: { ...parameters, locked: [pin] } }, tx);
      expect(revised.case.confirmations).toEqual([{ organisationId: org, revision: 2, status: "pending" }]);
      if (revised.case.scope !== "planner") throw new Error("Missing planner scope");
      expect(revised.case.events.filter(e => e.action === "approve")[0].revision).toBe(1);
      await withAuthenticatedTransaction(c, async db => {
        expect(await db`select * from railplan_private.coordination_proposals`).toEqual([]);
        await expect(db.savepoint(async probe => { await probe`delete from railplan_private.coordination_events`; })).rejects.toMatchObject({ code: "42501" });
      }, tx);
      await tx`reset role`;
      await expect(tx.savepoint(async probe => { await probe`update railplan_private.coordination_proposals set payload=payload where case_id=${created.id}`; })).rejects.toMatchObject({ code: "42501" });
    });
  });
  it("rejects a different saved result at the private Apply boundary", async () => {
    await fixture(async (tx, p, _c, _other, _org, requestId) => {
      const source = await createPlan(p, parameters, tx);
      const created = await createCase(p, { sourcePlanId: source.id, selectedRequestIds: [requestId], idempotencyKey: randomUUID(), parameters }, tx);
      const [{ facts, result, source_revision, input_digest }] = await tx`select * from railplan_private.planning_runs where id=${source.id}`;
      const forged = { ...result, objective: [{ label: "Forged", value: 0, unit: "" }], plan: { placements: source.placements, deferred: source.deferred } };
      const [{ id: different }] = await tx`select railplan_private.save_generated_plan(${PLANNING_NIGHT}::date,${source_revision}::bigint,${input_digest},${tx.json(facts)},${tx.json(parameters)},${tx.json(forged)}) as id`;
      const [{ outcome }] = await tx`select railplan_private.mutate_coordination_case(${created.id}::uuid,${tx.json({ action: "apply", expectedVersion: 1, revision: 1, idempotencyKey: randomUUID() })},null,${different}::uuid) as outcome`;
      expect(outcome).toEqual({ error: "invalid_plan" });
      expect((await getCase(p, created.id, tx)).version).toBe(1);
    });
  });
  it("rejects stale sources and can regenerate against a fresh same-night plan", async () => {
    await fixture(async (tx, p, _c, _other, _org, requestId) => {
      const source = await createPlan(p, parameters, tx);
      const created = await createCase(p, { sourcePlanId: source.id, selectedRequestIds: [requestId], idempotencyKey: randomUUID(), parameters }, tx);
      await tx`update public.maintenance_requests set description=description where id='M-001'`;
      await expect(actOnCase(p, created.id, { action: "apply", expectedVersion: 1, revision: 1, idempotencyKey: randomUUID() }, tx)).rejects.toMatchObject({ code: "stale_plan" });
      const fresh = await createPlan(p, parameters, tx);
      const revised = await actOnCase(p, created.id, { action: "revise", expectedVersion: 1, sourcePlanId: fresh.id, parameters }, tx);
      expect(revised.case.currentRevision).toBe(2);
      if (revised.case.scope !== "planner") throw new Error("Missing planner scope");
      expect(revised.case.proposals.map(p => p.sourcePlanId)).toEqual([source.id, fresh.id]);
    });
  });
  it("enforces planner lifecycle actions, trusted owner options and pending overdue state", async () => {
    await fixture(async (tx, p, c, other, org, requestId) => {
      const source = await createPlan(p, parameters, tx);
      const created = await createCase(p, { sourcePlanId: source.id, selectedRequestIds: [requestId], idempotencyKey: randomUUID(), parameters: { ...parameters, locked: [{ requestId, teamId: "T-TRK", startMinute: 180, endMinute: 195 }] }, deadline: "2020-01-01T00:00:00Z" }, tx);
      expect(created.overdue).toBe(true);
      expect(created.confirmations).toEqual([{ organisationId: org, revision: 1, status: "pending" }]);
      await expect(actOnCase(c, created.id, { action: "close", expectedVersion: 1, note: "No" }, tx)).rejects.toMatchObject({ code: "forbidden" });
      await expect(actOnCase(other, created.id, { action: "request-changes", expectedVersion: 1, revision: 1, note: "No" }, tx)).rejects.toMatchObject({ code: "not_found" });
      await expect(actOnCase(p, created.id, { action: "assign", expectedVersion: 1, ownerId: c.id }, tx)).rejects.toMatchObject({ code: "invalid_request" });
      const listed = await listCases(p, { overdue: "true" }, tx);
      expect(listed.owners).toContainEqual({ id: p.id, isCurrentUser: true });
      expect((await listCases(c, {}, tx)).owners).toBeUndefined();
      const assigned = await actOnCase(p, created.id, { action: "assign", expectedVersion: 1, ownerId: p.id }, tx);
      expect(assigned.case.version).toBe(2);
      const deadline = await actOnCase(p, created.id, { action: "deadline", expectedVersion: 2, deadline: null }, tx);
      expect(deadline.case.overdue).toBe(false);
      await actOnCase(p, created.id, { action: "escalate", expectedVersion: 3, note: "Review outstanding response" }, tx);
      const closed = await actOnCase(p, created.id, { action: "close", expectedVersion: 4, note: "Reviewed" }, tx);
      expect(closed.case.state).toBe("closed");
      expect(closed.case.confirmations[0].status).toBe("pending");
      await actOnCase(p, created.id, { action: "reopen", expectedVersion: 5, note: "Review again" }, tx);
      const withdrawn = await actOnCase(p, created.id, { action: "withdraw", expectedVersion: 6, note: "Another proposal needed" }, tx);
      if (withdrawn.case.scope !== "planner") throw new Error("Missing planner scope");
      expect(withdrawn.case.proposals[0].state).toBe("withdrawn");
      await expect(actOnCase(p, created.id, { action: "apply", expectedVersion: 7, revision: 1, idempotencyKey: randomUUID() }, tx)).rejects.toMatchObject({ code: "conflict" });
    });
  });
});
