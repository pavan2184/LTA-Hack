// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { connect } from "@/lib/db/client";
import { withAuthenticatedTransaction, type VerifiedIdentity } from "@/lib/auth/session";
import { createPlan, publishPlan } from "@/lib/plans/service";
import { createRequest, actOnRequest } from "@/lib/requests/service";
import { recordDeferral, getWorkItem, listWorkItems, actOnWorkItem } from "@/lib/deferred-work/service";
import { PLANNING_NIGHT } from "@railplan/core/data/requests";
const sql = connect();
afterAll(() => sql.end({ timeout: 1 }));
const parameters = { planningNight: PLANNING_NIGHT, strategy: "balanced" as const, locked: [] };
const rollback = new Error("rollback deferred-work fixtures");
const identity = (id: string) => ({ id }) as VerifiedIdentity;
async function fixture(work: (tx: TransactionSql, p: VerifiedIdentity, c: VerifiedIdentity, other: VerifiedIdentity) => Promise<void>) {
  await expect(sql.begin(async tx => {
    const p = randomUUID(), c = randomUUID(), other = randomUUID(), org = randomUUID(), foreignOrg = randomUUID();
    await tx`insert into auth.users(id) values(${p}),(${c}),(${other})`;
    await tx`insert into public.contractor_organisations(id,name) values(${org},'Deferred rollback'),(${foreignOrg},'Foreign rollback')`;
    await tx`insert into public.profiles(id,role,contractor_organisation_id) values(${p},'planner',null),(${c},'contractor',${org}),(${other},'contractor',${foreignOrg})`;
    await work(tx, identity(p), identity(c), identity(other));
    throw rollback;
  })).rejects.toBe(rollback);
}
const record = (planId: string, requestId = "M-006") => ({ planId, requestId, reason: "Planner private reason", idempotencyKey: randomUUID() });
async function approved(tx: TransactionSql, p: VerifiedIdentity, c: VerifiedIdentity) {
  const draft = await createRequest(c, { fields: { planningNight: PLANNING_NIGHT, title: "Identical title", description: "Deferred fixture", workClass: "civil", blockIds: ["NS10-NS11"], durationMinutes: 240, preferredStart: 0, earliestStart: 0, latestEnd: 240, equipment: [], workforce: [{ roleId: "technician", count: 1 }] } }, tx);
  await actOnRequest(c, draft.id, { expectedVersion: 1, action: "submit", reason: "" }, tx);
  await actOnRequest(p, draft.id, { expectedVersion: 2, action: "approve", reason: "Reviewed", approval: { teamId: "T-TRK", priority: "low", clearanceMinutes: 0, requiredSkills: [], dependencies: [], dependencyLagMinutes: 0, safetyConfirmed: true } }, tx);
  return draft.id;
}
describe("deferred-work real authenticated rollback persistence", { timeout: 30000 }, () => {
  it("keeps generated drafts inert and validates exact deferral before idempotent recording", () => fixture(async (tx, p) => {
    const source = await createPlan(p, parameters, tx);
    await createPlan(p, parameters, tx);
    expect((await listWorkItems(p, { ownerId: p.id }, tx)).items).toEqual([]);
    await expect(recordDeferral(p, record(source.id, "M-001"), tx)).rejects.toMatchObject({ code: "invalid_request" });
    const input = record(source.id);
    const created = await recordDeferral(p, input, tx);
    expect(created).toMatchObject({ ownerId: p.id, sourceRequestId: "M-006", repeatThreshold: 2, deferredCount: 1 });
    expect((await recordDeferral(p, input, tx)).id).toBe(created.id);
    expect((await recordDeferral(p, record(source.id), tx)).id).toBe(created.id);
    expect((await getWorkItem(p, created.id, tx)).deferredCount).toBe(1);
    await expect(recordDeferral(p, { ...input, reason: "Changed replay" }, tx)).rejects.toMatchObject({ code: "conflict" });
  }));
  it("records publication once, corrects same-night replacement, ignores obsolete historical deferrals and reopens removal", () => fixture(async (tx, p) => {
    const source = await createPlan(p, parameters, tx);
    await publishPlan(p, source.id, tx);
    const work = (await listWorkItems(p, { ownerId: p.id }, tx)).items.find(w => w.sourceRequestId === "M-006")!;
    expect(work).toBeDefined();
    expect(work.deferredCount).toBe(1);
    const eventCount = (await getWorkItem(p, work.id, tx)).events!.length;
    await publishPlan(p, source.id, tx);
    expect((await getWorkItem(p, work.id, tx)).events).toHaveLength(eventCount);
    const scheduled = await createPlan(p, { ...parameters, strategy: "max-completion" }, tx);
    expect(scheduled.placements.some(x => x.requestId === "M-006")).toBe(true);
    await publishPlan(p, scheduled.id, tx);
    expect(await getWorkItem(p, work.id, tx)).toMatchObject({ state: "scheduled", deferredCount: 0 });
    await recordDeferral(p, record(source.id), tx);
    const corrected = await getWorkItem(p, work.id, tx);
    expect(corrected).toMatchObject({ state: "scheduled", deferredCount: 0 });
    expect(corrected.events?.some(e => e.kind === "deferred")).toBe(true);
    expect(corrected.events?.some(e => e.kind === "scheduled")).toBe(true);
    const removed = await createPlan(p, parameters, tx);
    await publishPlan(p, removed.id, tx);
    expect(await getWorkItem(p, work.id, tx)).toMatchObject({ state: "open", deferredCount: 1 });
  }));
  it("preserves lifecycle reasons, source revision and trusted owner reassignment", () => fixture(async (tx, p, c) => {
    const source = await createPlan(p, parameters, tx);
    const work = await recordDeferral(p, record(source.id), tx);
    await tx`reset role`;
    const [basis] = await tx`select revision,lock_generation from railplan_private.planning_source`;
    await expect(actOnWorkItem(p, work.id, { action: "update", expectedVersion: work.version, ownerId: c.id }, tx)).rejects.toMatchObject({ code: "invalid_request" });
    const changed = await actOnWorkItem(p, work.id, { action: "update", expectedVersion: work.version, ownerId: p.id, dueDate: "2026-01-01", repeatThreshold: 1 }, tx);
    expect(changed.flags).toMatchObject({ overdue: true, repeated: true });
    await expect(actOnWorkItem(p, work.id, { action: "complete", expectedVersion: work.version, note: "Stale" }, tx)).rejects.toMatchObject({ code: "conflict" });
    const done = await actOnWorkItem(p, work.id, { action: "complete", expectedVersion: changed.version, note: "Physical work confirmed" }, tx);
    expect(done).toMatchObject({ state: "completed", flags: { overdue: false } });
    await publishPlan(p, source.id, tx);
    expect((await getWorkItem(p, work.id, tx)).state).toBe("completed");
    const reopened = await actOnWorkItem(p, work.id, { action: "reopen", expectedVersion: (await getWorkItem(p, work.id, tx)).version!, note: "Follow-up required" }, tx);
    const cancelled = await actOnWorkItem(p, work.id, { action: "cancel", expectedVersion: reopened.version, note: "Scope withdrawn" }, tx);
    expect(cancelled.events?.map(e => e.note)).toContain("Physical work confirmed");
    await publishPlan(p, (await createPlan(p, { ...parameters, strategy: "max-completion" }, tx)).id, tx);
    expect((await getWorkItem(p, work.id, tx)).state).toBe("cancelled");
    await tx`reset role`;
    expect((await tx`select revision from railplan_private.planning_source`)[0].revision).toBe(basis.revision);
  }));
  it("scopes contractor DTOs and RLS while distinct intake UUIDs retain distinct identity", () => fixture(async (tx, p, c, other) => {
    const a = await approved(tx, p, c), b = await approved(tx, p, c);
    const source = await createPlan(p, parameters, tx);
    const first = await recordDeferral(p, record(source.id, "R-" + a), tx);
    const second = await recordDeferral(p, record(source.id, "R-" + b), tx);
    const seeded = await recordDeferral(p, record(source.id), tx);
    expect(first.id).not.toBe(second.id);
    expect(first.submissions).toEqual([{ submissionId: a, planningNight: PLANNING_NIGHT, kind: "source" }]);
    const own = await getWorkItem(c, first.id, tx);
    expect(own.scope).toBe("contractor");
    expect(own).not.toHaveProperty("events");
    expect(JSON.stringify(own)).not.toContain("Planner private reason");
    await expect(getWorkItem(other, first.id, tx)).rejects.toMatchObject({ code: "not_found" });
    await expect(getWorkItem(c, seeded.id, tx)).rejects.toMatchObject({ code: "not_found" });
    expect((await listWorkItems(other, {}, tx)).items).toEqual([]);
    await expect(recordDeferral(c, record(source.id), tx)).rejects.toMatchObject({ code: "forbidden" });
    await expect(actOnWorkItem(c, first.id, { action: "complete", expectedVersion: first.version, note: "No" }, tx)).rejects.toMatchObject({ code: "forbidden" });
    await withAuthenticatedTransaction(c, async db => {
      const [{ value }] = await db`select railplan_private.read_work_item(${first.id}::uuid,true) as value`;
      for (const field of ["sourcePlanId", "ownerId", "version", "events", "submissions"]) expect(value).not.toHaveProperty(field);
      expect((await db`select railplan_private.read_work_item(${seeded.id}::uuid,true) as value`)[0].value).toBeNull();
      expect(await db`select * from railplan_private.work_items`).toEqual([]);
      expect(await db`select * from railplan_private.work_item_events`).toEqual([]);
      await expect(db.savepoint(async s => { await s`delete from railplan_private.work_item_events`; })).rejects.toMatchObject({ code: "42501" });
    }, tx);
    await tx`reset role`;
    await tx`select set_config('request.jwt.claims','{}',true)`;
    expect((await tx`select railplan_private.read_work_item(${seeded.id}::uuid,true) as value`)[0].value).toBeNull();
    await expect(tx.savepoint(async s => { await s`update railplan_private.work_item_events set note=note where work_item_id=${first.id}`; })).rejects.toMatchObject({ code: "42501" });
  }));
  it("provides bounded owner/night catalogues and filters without modifying planning metadata", () => fixture(async (tx, p, c) => {
    const source = await createPlan(p, parameters, tx);
    const first = await recordDeferral(p, record(source.id), tx);
    const second = await recordDeferral(p, record(source.id, "M-019"), tx);
    await tx`reset role`;
    const [basis] = await tx`select revision,lock_generation from railplan_private.planning_source`;
    const proposed = await actOnWorkItem(p, first.id, { action: "propose-night", expectedVersion: first.version, planningNight: PLANNING_NIGHT, note: "Review this configured target" }, tx);
    expect(proposed.flags.awaitingTargetNightReview).toBe(true);
    await expect(actOnWorkItem(p, first.id, { action: "propose-night", expectedVersion: proposed.version, planningNight: "2099-12-30", note: "Unknown target" }, tx)).rejects.toMatchObject({ code: "invalid_request" });
    const page = await listWorkItems(p, { ownerId: p.id, limit: 1, missingDue: "true" }, tx);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeTruthy();
    expect(page.owners).toContainEqual({ id: p.id, isCurrentUser: true });
    expect(page.nights.some(n => n.planningNight === PLANNING_NIGHT)).toBe(true);
    expect(page.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const next = await listWorkItems(p, { ownerId: p.id, limit: 1, cursor: page.nextCursor! }, tx);
    expect(new Set([...page.items, ...next.items].map(w => w.id))).toEqual(new Set([first.id, second.id]));
    expect((await listWorkItems(c, {}, tx)).owners).toBeUndefined();
    await tx`reset role`;
    expect((await tx`select revision,lock_generation from railplan_private.planning_source`)[0]).toEqual(basis);
  }));
  it("resolves explicitly linked submission UUIDs to one item without conflating unrelated titles", () => fixture(async (tx, p, c) => {
    const a = await approved(tx, p, c), b = await approved(tx, p, c);
    const source = await createPlan(p, parameters, tx);
    const item = await recordDeferral(p, record(source.id, "R-" + a), tx);
    // Future carry-forward owns link creation; fixture inserts only an identity
    // link between ordinary reviewed submissions to exercise Task 1 resolution.
    await tx`reset role`;
    await tx`insert into railplan_private.work_item_submissions(submission_id,work_item_id,planning_night,kind,created_by) values(${b},${item.id},${PLANNING_NIGHT},'carry-forward',${p.id})`;
    const linked = await recordDeferral(p, record(source.id, "R-" + b), tx);
    expect(linked.id).toBe(item.id);
    expect(linked.deferredCount).toBe(1);
    expect(linked.submissions).toHaveLength(2);
  }));
  it("preserves immutable actor identity after profile deletion and exposes missing ownership", () => fixture(async (tx, p) => {
    const source = await createPlan(p, parameters, tx);
    const item = await recordDeferral(p, record(source.id), tx);
    const successor = randomUUID();
    await tx`reset role`;
    await tx`insert into auth.users(id) values(${successor})`;
    await tx`insert into public.profiles(id,role) values(${successor},'planner')`;
    const reassigned = await actOnWorkItem(p, item.id, { action: "update", expectedVersion: item.version, ownerId: successor }, tx);
    expect(reassigned.ownerId).toBe(successor);
    await tx`reset role`;
    await tx`delete from auth.users where id=${p.id} or id=${successor}`;
    const [{ actor_id }] = await tx`select actor_id from railplan_private.work_item_events where work_item_id=${item.id} and kind='record'`;
    expect(actor_id).toBe(p.id);
    // Another independently provisioned trusted planner may read the retained audit.
    const reader = randomUUID();
    await tx`insert into auth.users(id) values(${reader})`;
    await tx`insert into public.profiles(id,role) values(${reader},'planner')`;
    expect(await getWorkItem(identity(reader), item.id, tx)).toMatchObject({ ownerId: null, flags: { missingOwner: true } });
  }));
});
