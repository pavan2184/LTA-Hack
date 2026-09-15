// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { connect } from "@/lib/db/client";
import { loadPlanningInstance } from "@/lib/db/instance";
import { withAuthenticatedTransaction, type VerifiedIdentity } from "@/lib/auth/session";
import { createPlan, publishPlan } from "@/lib/plans/service";
import { createRequest, actOnRequest, getRequest, updateRequest } from "@/lib/requests/service";
import { recordDeferral, getWorkItem } from "@/lib/deferred-work/service";
import { prepareCarryForward } from "@/lib/deferred-work/carry-forward";
import { PLANNING_NIGHT } from "@railplan/core/data/requests";
const sql = connect();
afterAll(() => sql.end({ timeout: 1 }));
const rollback = new Error("rollback carry-forward fixtures");
const parameters = { planningNight: PLANNING_NIGHT, strategy: "balanced" as const, locked: [] };
const approval = { teamId: "T-TRK", priority: "low" as const, clearanceMinutes: 0, requiredSkills: [], dependencies: [], dependencyLagMinutes: 0, safetyConfirmed: true as const };
async function fixture(work: (tx: TransactionSql, p: VerifiedIdentity, c: VerifiedIdentity, org: string, target: string) => Promise<void>) {
  await expect(sql.begin(async tx => {
    const p = randomUUID(), c = randomUUID(), org = randomUUID(), target = "2097-09-15";
    await tx`insert into auth.users(id) values(${p}),(${c})`;
    await tx`insert into public.contractor_organisations(id,name) values(${org},'Carry rollback')`;
    await tx`insert into public.profiles(id,role,contractor_organisation_id) values(${p},'planner',null),(${c},'contractor',${org})`;
    await tx`insert into public.planning_nights select ${target}::date,window_start_minute,window_end_minute,slot_minutes,minutes_per_block_hop,inter_line_transfer_minutes from public.planning_nights where planning_night=${PLANNING_NIGHT}`;
    await work(tx, { id: p } as VerifiedIdentity, { id: c } as VerifiedIdentity, org, target);
    throw rollback;
  })).rejects.toBe(rollback);
}
async function seeded(tx: TransactionSql, p: VerifiedIdentity) {
  const source = await createPlan(p, parameters, tx);
  const item = await recordDeferral(p, { planId: source.id, requestId: "M-006", reason: "Private source note", idempotencyKey: randomUUID() }, tx);
  return { source, item };
}
describe("reviewed carry-forward database boundary", { timeout: 40000 }, () => {
  it("refreshes same-target preparation after original-source reapproval without rewriting old retries", () => fixture(async (tx, p, c, _org, target) => {
    const source = await createRequest(c, { fields: { planningNight: PLANNING_NIGHT, title: "Reapproved carry source", description: "Preserve immutable preparation context", workClass: "civil", blockIds: ["NS10-NS11"], durationMinutes: 15, preferredStart: 0, earliestStart: 0, latestEnd: 240, equipment: [], workforce: [{ roleId: "technician", count: 10000 }] } }, tx);
    await actOnRequest(c, source.id, { action: "submit", expectedVersion: 1, reason: "" }, tx);
    await actOnRequest(p, source.id, { action: "approve", expectedVersion: 2, reason: "Source revision three", approval }, tx);
    const plan = await createPlan(p, parameters, tx);
    const item = await recordDeferral(p, { planId: plan.id, requestId: "R-" + source.id, reason: "Track original source", idempotencyKey: randomUUID() }, tx);
    const originalCommand = { expectedVersion: item.version, targetNight: target, idempotencyKey: randomUUID() };
    const old = await prepareCarryForward(p, item.id, originalCommand, tx);
    await actOnRequest(c, old.requestId, { action: "submit", expectedVersion: 1, reason: "" }, tx);
    await tx`reset role`;
    const [originalPreparation] = await tx`select * from railplan_private.carry_forward_preparations where submission_id=${old.requestId}`;
    await actOnRequest(p, source.id, { action: "revise", expectedVersion: 3, reason: "" }, tx);
    await actOnRequest(p, source.id, { action: "submit", expectedVersion: 4, reason: "" }, tx);
    await actOnRequest(p, source.id, { action: "approve", expectedVersion: 5, reason: "Source revision six", approval }, tx);
    await expect(actOnRequest(p, old.requestId, { action: "approve", expectedVersion: 2, reason: "Stale preparation must remain invalid", approval, carryForward: { expectedWorkVersion: (await getWorkItem(p, item.id, tx)).version!, dependenciesReviewed: true } }, tx)).rejects.toMatchObject({ code: "conflict" });
    expect(await prepareCarryForward(p, item.id, originalCommand, tx)).toEqual(old);
    const refreshed = await prepareCarryForward(p, item.id, { expectedVersion: (await getWorkItem(p, item.id, tx)).version!, targetNight: target, idempotencyKey: randomUUID() }, tx);
    expect(refreshed.requestId).not.toBe(old.requestId);
    expect(await prepareCarryForward(p, item.id, { expectedVersion: (await getWorkItem(p, item.id, tx)).version!, targetNight: target, idempotencyKey: randomUUID() }, tx)).toEqual(refreshed);
    await actOnRequest(c, refreshed.requestId, { action: "submit", expectedVersion: 1, reason: "" }, tx);
    await actOnRequest(p, refreshed.requestId, { action: "approve", expectedVersion: 2, reason: "Approve refreshed source context", approval, carryForward: { expectedWorkVersion: (await getWorkItem(p, item.id, tx)).version!, dependenciesReviewed: true } }, tx);
    expect((await getRequest(p, source.id, tx)).activeApprovedRevision).toBeNull();
    expect((await getRequest(p, old.requestId, tx)).activeApprovedRevision).toBeNull();
    expect((await withAuthenticatedTransaction(p, db => loadPlanningInstance(db, target), tx)).requests.map(r => r.id)).toEqual(["R-" + refreshed.requestId]);
    await tx`reset role`;
    expect((await tx`select * from railplan_private.carry_forward_preparations where submission_id=${old.requestId}`)[0]).toEqual(originalPreparation);
    expect(await tx`select source_generation,source_submission_version from railplan_private.carry_forward_preparations where work_item_id=${item.id} order by source_submission_version`).toEqual([{ source_generation: 0, source_submission_version: 3 }, { source_generation: 0, source_submission_version: 6 }]);
    expect(await tx`select s.id from railplan_private.request_submissions s join railplan_private.work_item_submissions l on l.submission_id=s.id where l.work_item_id=${item.id} and s.active_approved_version is not null`).toHaveLength(1);
  }));
  it("supports historical carry-forward when the configured target is later than its source", () => fixture(async (tx, p, c) => {
    await tx`insert into public.planning_nights select d::date,window_start_minute,window_end_minute,slot_minutes,minutes_per_block_hop,inter_line_transfer_minutes from public.planning_nights cross join (values('2020-01-01'),('2020-01-02')) dates(d) where planning_night=${PLANNING_NIGHT}`;
    const source = await createRequest(c, { fields: { planningNight: "2020-01-01", title: "Historical carry-forward", description: "Fabricated historical work", workClass: "civil", blockIds: ["NS10-NS11"], durationMinutes: 15, preferredStart: 0, earliestStart: 0, latestEnd: 240, equipment: [], workforce: [{ roleId: "technician", count: 10000 }] } }, tx);
    await actOnRequest(c, source.id, { action: "submit", expectedVersion: 1, reason: "" }, tx);
    await actOnRequest(p, source.id, { action: "approve", expectedVersion: 2, reason: "Historical review", approval }, tx);
    const plan = await createPlan(p, { ...parameters, planningNight: "2020-01-01" }, tx);
    const item = await recordDeferral(p, { planId: plan.id, requestId: "R-" + source.id, reason: "Historical deferred source", idempotencyKey: randomUUID() }, tx);
    const prepared = await prepareCarryForward(p, item.id, { expectedVersion: item.version, targetNight: "2020-01-02", idempotencyKey: randomUUID() }, tx);
    expect((await getRequest(c, prepared.requestId, tx)).fields.planningNight).toBe("2020-01-02");
  }));
  it("prepares one linked draft on retry and keeps it outside the solver", () => fixture(async (tx, p, c, org, target) => {
    const { source, item } = await seeded(tx, p);
    const command = { expectedVersion: item.version, targetNight: target, organisationId: org, idempotencyKey: randomUUID() };
    const first = await prepareCarryForward(p, item.id, command, tx);
    const retried = await prepareCarryForward(p, item.id, command, tx);
    expect(first.requestId).toBe(retried.requestId);
    expect(await prepareCarryForward(p, item.id, { ...command, expectedVersion: (await getWorkItem(p, item.id, tx)).version!, idempotencyKey: randomUUID() }, tx)).toEqual(first);
    const draft = await getRequest(c, first.requestId, tx);
    expect(draft.status).toBe("draft");
    expect(draft.fields.planningNight).toBe(target);
    expect(JSON.stringify(draft)).not.toContain("Private source note");
    const targetFacts = await withAuthenticatedTransaction(p, db => loadPlanningInstance(db, target), tx);
    expect(targetFacts.requests.some(r => r.id === `R-${first.requestId}`)).toBe(false);
    expect((await withAuthenticatedTransaction(p, db => loadPlanningInstance(db, PLANNING_NIGHT), tx)).requests.some(r => r.id === "M-006")).toBe(true);
    await expect(prepareCarryForward(p, item.id, { ...command, targetNight: PLANNING_NIGHT }, tx)).rejects.toMatchObject({ code: "conflict" });
    await tx`reset role`;
    expect((await tx`select facts->'requests' as requests from railplan_private.planning_runs where id=${source.id}`)[0].requests.some((r: { id: string }) => r.id === "M-006")).toBe(true);
  }));
  it("requires explicit seeded organisation and rejects unknown or incompatible target windows", () => fixture(async (tx, p, c, org, target) => {
    const { item } = await seeded(tx, p);
    const command = { expectedVersion: item.version, targetNight: target, idempotencyKey: randomUUID() };
    await expect(prepareCarryForward(p, item.id, command, tx)).rejects.toMatchObject({ code: "invalid_request" });
    await expect(prepareCarryForward(c, item.id, { ...command, organisationId: org }, tx)).rejects.toMatchObject({ code: "forbidden" });
    await expect(prepareCarryForward(p, item.id, { ...command, organisationId: org, targetNight: "2097-09-16" }, tx)).rejects.toMatchObject({ code: "invalid_request" });
    await tx`reset role`;
    await tx`insert into public.planning_nights select '2020-01-01'::date,window_start_minute,window_end_minute,slot_minutes,minutes_per_block_hop,inter_line_transfer_minutes from public.planning_nights where planning_night=${PLANNING_NIGHT}`;
    await expect(prepareCarryForward(p, item.id, { ...command, organisationId: org, targetNight: "2020-01-01" }, tx)).rejects.toMatchObject({ code: "invalid_request" });
    await tx`reset role`;
    await tx`update public.planning_nights set window_end_minute=15 where planning_night=${target}`;
    await expect(prepareCarryForward(p, item.id, { ...command, organisationId: org }, tx)).rejects.toMatchObject({ code: "invalid_request" });
  }));
  it("requires normal intake review, retires seeded input atomically, and preserves saved facts", () => fixture(async (tx, p, c, org, target) => {
    const { source, item } = await seeded(tx, p);
    const first = await prepareCarryForward(p, item.id, { expectedVersion: item.version, targetNight: target, organisationId: org, idempotencyKey: randomUUID() }, tx);
    await actOnRequest(c, first.requestId, { expectedVersion: 1, action: "submit", reason: "" }, tx);
    await expect(actOnRequest(p, first.requestId, { expectedVersion: 2, action: "approve", reason: "Reviewed", approval }, tx)).rejects.toMatchObject({ code: "invalid_request" });
    const reviewed = await getRequest(p, first.requestId, tx);
    expect(reviewed.carryForward).toMatchObject({ workItemId: item.id, originalDependencies: expect.any(Array) });
    const dependent = await createRequest(c, { fields: { ...reviewed.fields, planningNight: PLANNING_NIGHT, title: "Active dependent" } }, tx);
    await actOnRequest(c, dependent.id, { expectedVersion: 1, action: "submit", reason: "" }, tx);
    await actOnRequest(p, dependent.id, { expectedVersion: 2, action: "approve", reason: "Depends on source", approval: { ...approval, dependencies: ["M-006"] } }, tx);
    await expect(actOnRequest(p, first.requestId, { expectedVersion: 2, action: "approve", reason: "Acknowledgement cannot orphan dependent", approval, carryForward: { expectedWorkVersion: (await getWorkItem(p, item.id, tx)).version!, dependenciesReviewed: true } }, tx)).rejects.toMatchObject({ code: "invalid_request" });
    expect((await getRequest(p, first.requestId, tx)).activeApprovedRevision).toBeNull();
    await actOnRequest(p, dependent.id, { expectedVersion: 3, action: "cancel", reason: "Resolve dependent before source retirement" }, tx);
    await tx`reset role`;
    const beforeRevision = (await tx`select revision from railplan_private.planning_source`)[0].revision;
    await actOnRequest(p, first.requestId, { expectedVersion: 2, action: "approve", reason: "Reviewed target references", approval, carryForward: { expectedWorkVersion: (await getWorkItem(p, item.id, tx)).version!, dependenciesReviewed: true } }, tx);
    const sourceFacts = await withAuthenticatedTransaction(p, db => loadPlanningInstance(db, PLANNING_NIGHT), tx);
    expect(sourceFacts.requests.some(r => r.id === "M-006")).toBe(false);
    expect(sourceFacts.workforceDemand.some(r => r.requestId === "M-006")).toBe(false);
    const targetFacts = await withAuthenticatedTransaction(p, db => loadPlanningInstance(db, target), tx);
    expect(targetFacts.requests.filter(r => r.id === `R-${first.requestId}`)).toHaveLength(1);
    await tx`reset role`;
    expect((await tx`select revision from railplan_private.planning_source`)[0].revision).not.toBe(beforeRevision);
    expect(await tx`select id from public.maintenance_requests where id='M-006'`).toHaveLength(1);
    expect((await tx`select facts->'requests' as requests from railplan_private.planning_runs where id=${source.id}`)[0].requests.some((r: { id: string }) => r.id === "M-006")).toBe(true);
    await actOnRequest(p, first.requestId, { expectedVersion: 3, action: "revise", reason: "" }, tx);
    await actOnRequest(p, first.requestId, { expectedVersion: 4, action: "submit", reason: "" }, tx);
    await actOnRequest(p, first.requestId, { expectedVersion: 5, action: "approve", reason: "Reapproved mapped occurrence", approval }, tx);
    expect((await withAuthenticatedTransaction(p, db => loadPlanningInstance(db, target), tx)).requests.find(r => r.id === `R-${first.requestId}`)?.submissionRevision).toBe(6);
    await actOnRequest(p, first.requestId, { expectedVersion: 6, action: "cancel", reason: "Cancel mapped occurrence" }, tx);
    expect((await withAuthenticatedTransaction(p, db => loadPlanningInstance(db, target), tx)).requests).toEqual([]);
    expect((await withAuthenticatedTransaction(p, db => loadPlanningInstance(db, PLANNING_NIGHT), tx)).requests.some(r => r.id === "M-006")).toBe(false);
    await actOnRequest(p, first.requestId, { expectedVersion: 7, action: "revise", reason: "" }, tx);
    await actOnRequest(p, first.requestId, { expectedVersion: 8, action: "submit", reason: "" }, tx);
    await actOnRequest(p, first.requestId, { expectedVersion: 9, action: "approve", reason: "Restore latest cancelled occurrence", approval }, tx);
    expect((await withAuthenticatedTransaction(p, db => loadPlanningInstance(db, target), tx)).requests.find(r => r.id === `R-${first.requestId}`)?.submissionRevision).toBe(10);
    const current = await getWorkItem(p, item.id, tx);
    expect(current).toHaveProperty("activeNight", target);
    expect(await getWorkItem(c, item.id, tx)).not.toHaveProperty("activeNight");
    await tx`reset role`;
    await tx`insert into public.planning_nights select '2097-09-14'::date,window_start_minute,window_end_minute,slot_minutes,minutes_per_block_hop,inter_line_transfer_minutes from public.planning_nights where planning_night=${PLANNING_NIGHT}`;
    await expect(prepareCarryForward(p, item.id, { expectedVersion: current.version!, targetNight: "2097-09-14", idempotencyKey: randomUUID() }, tx)).rejects.toMatchObject({ code: "invalid_request" });
  }));
  it("requires exact current published-source confirmation and rejects stale confirmation", () => fixture(async (tx, p, c, org, target) => {
    const { item } = await seeded(tx, p);
    const published = await createPlan(p, { ...parameters, strategy: "max-completion" }, tx);
    await publishPlan(p, published.id, tx);
    const first = await prepareCarryForward(p, item.id, { expectedVersion: (await getWorkItem(p, item.id, tx)).version!, targetNight: target, organisationId: org, idempotencyKey: randomUUID() }, tx);
    await actOnRequest(c, first.requestId, { expectedVersion: 1, action: "submit", reason: "" }, tx);
    const review = { expectedWorkVersion: (await getWorkItem(p, item.id, tx)).version!, dependenciesReviewed: true as const };
    await expect(actOnRequest(p, first.requestId, { expectedVersion: 2, action: "approve", reason: "Reviewed", approval, carryForward: review }, tx)).rejects.toMatchObject({ code: "invalid_request" });
    const replacement = await createPlan(p, { ...parameters, strategy: "max-completion" }, tx);
    await publishPlan(p, replacement.id, tx);
    const currentReview = { ...review, expectedWorkVersion: (await getWorkItem(p, item.id, tx)).version! };
    await expect(actOnRequest(p, first.requestId, { expectedVersion: 2, action: "approve", reason: "Reviewed", approval, carryForward: { ...currentReview, publication: { planId: published.id, submissionRevision: null } } }, tx)).rejects.toMatchObject({ code: "conflict" });
    await actOnRequest(p, first.requestId, { expectedVersion: 2, action: "approve", reason: "Explicitly retire published source", approval, carryForward: { ...currentReview, publication: { planId: replacement.id, submissionRevision: null } } }, tx);
    expect((await getWorkItem(p, item.id, tx)).state).toBe("open");
  }));
  it("keeps incompatible source dependencies as review evidence and blocks active dependents", () => fixture(async (tx, p, c, org, target) => {
    const draft = await createRequest(c, { fields: { planningNight: PLANNING_NIGHT, title: "Carry dependency source", description: "Preserve prerequisites", workClass: "civil", blockIds: ["NS10-NS11"], durationMinutes: 240, preferredStart: 0, earliestStart: 0, latestEnd: 240, equipment: [], workforce: [{ roleId: "technician", count: 1 }] } }, tx);
    await actOnRequest(c, draft.id, { expectedVersion: 1, action: "submit", reason: "" }, tx);
    await actOnRequest(p, draft.id, { expectedVersion: 2, action: "approve", reason: "Original approval", approval: { ...approval, dependencies: ["M-001"] } }, tx);
    const plan = await createPlan(p, parameters, tx);
    const item = await recordDeferral(p, { planId: plan.id, requestId: `R-${draft.id}`, reason: "Unresolved", idempotencyKey: randomUUID() }, tx);
    // Cancelling an unretired original remains compatible with normal reapproval.
    await actOnRequest(p, draft.id, { expectedVersion: 3, action: "cancel", reason: "Ordinary cancellation" }, tx);
    await actOnRequest(p, draft.id, { expectedVersion: 4, action: "revise", reason: "" }, tx);
    await actOnRequest(p, draft.id, { expectedVersion: 5, action: "submit", reason: "" }, tx);
    await actOnRequest(p, draft.id, { expectedVersion: 6, action: "approve", reason: "Ordinary reapproval", approval: { ...approval, dependencies: ["M-001"] } }, tx);
    const prepared = await prepareCarryForward(p, item.id, { expectedVersion: (await getWorkItem(p, item.id, tx)).version!, targetNight: target, idempotencyKey: randomUUID() }, tx);
    await actOnRequest(p, draft.id, { expectedVersion: 7, action: "revise", reason: "" }, tx);
    await updateRequest(p, draft.id, { expectedVersion: 8, fields: { ...draft.fields, planningNight: target } }, tx);
    await actOnRequest(p, draft.id, { expectedVersion: 9, action: "submit", reason: "" }, tx);
    await withAuthenticatedTransaction(p, async db => {
      const [{ result }] = await db`select railplan_private.mutate_request(${draft.id}::uuid,10,'approve',null,${db.json(approval)},'Cannot bypass cross-night review') as result`;
      expect(result.code).toBe("invalid_request");
    }, tx);
    expect((await getRequest(p, prepared.requestId, tx)).carryForward?.originalDependencies).toEqual(["M-001"]);
    await actOnRequest(c, prepared.requestId, { expectedVersion: 1, action: "submit", reason: "" }, tx);
    const review = { expectedWorkVersion: (await getWorkItem(p, item.id, tx)).version!, dependenciesReviewed: true as const };
    await expect(actOnRequest(p, prepared.requestId, { expectedVersion: 2, action: "approve", reason: "Cannot bypass dependencies", approval: { ...approval, dependencies: ["M-001"] }, carryForward: review }, tx)).rejects.toMatchObject({ code: "invalid_request" });
    await actOnRequest(p, prepared.requestId, { expectedVersion: 2, action: "approve", reason: "Removed incompatible prerequisite after review", approval, carryForward: review }, tx);
    expect((await getRequest(p, draft.id, tx)).activeApprovedRevision).toBeNull();
    await withAuthenticatedTransaction(p, async db => {
      const [{ result }] = await db`select railplan_private.mutate_request(${draft.id}::uuid,10,'approve',null,${db.json(approval)},'Cannot reactivate retired source') as result`;
      expect(result.code).toBe("conflict");
    }, tx);
  }));
  it("denies raw writes, hidden entrypoints, forged preparation owners and foreign review detail", () => fixture(async (tx, p, c, org, target) => {
    const { item } = await seeded(tx, p);
    const prepared = await prepareCarryForward(p, item.id, { expectedVersion: item.version, targetNight: target, organisationId: org, idempotencyKey: randomUUID() }, tx);
    await withAuthenticatedTransaction(c, async db => {
      const [{ review }] = await db`select railplan_private.read_carry_forward(${prepared.requestId}::uuid) as review`;
      expect(Object.keys(review).sort()).toEqual(["sourceNight", "targetNight", "workItemId"]);
      expect(await db`select * from railplan_private.carry_forward_preparations`).toEqual([]);
      await expect(db.savepoint(async sp => { await sp`select railplan_private.mutate_request_before_carry_forward(null,null,'create',null,null,'')`; })).rejects.toMatchObject({ code: "42501" });
      await expect(db.savepoint(async sp => { await sp`delete from railplan_private.work_item_active_occurrences`; })).rejects.toMatchObject({ code: "42501" });
    }, tx);
    await withAuthenticatedTransaction(p, async db => {
      const [{ result }] = await db`select railplan_private.prepare_carry_forward(${item.id}::uuid,${db.json({ expectedVersion: 5, targetNight: target, organisationId: org, idempotencyKey: randomUUID(), ownerId: c.id })}) as result`;
      expect(result.error).toBe("invalid_request");
    }, tx);
    await tx`reset role`;
    const outsider = randomUUID(), foreign = randomUUID();
    await tx`insert into auth.users(id) values(${outsider})`;
    await tx`insert into public.contractor_organisations(id,name) values(${foreign},'Foreign carry reviewer')`;
    await tx`insert into public.profiles(id,role,contractor_organisation_id) values(${outsider},'contractor',${foreign})`;
    await withAuthenticatedTransaction({ id: outsider } as VerifiedIdentity, async db => {
      expect((await db`select railplan_private.read_carry_forward(${prepared.requestId}::uuid) as review`)[0].review).toBeNull();
    }, tx);
    await tx`reset role`;
    await expect(tx.savepoint(async sp => { await sp`insert into railplan_private.work_item_active_occurrences(work_item_id,request_id,planning_night,generation,last_submission_id) values(${item.id},'invalid',${target},1,${prepared.requestId})`; })).rejects.toMatchObject({ code: "23514" });
    expect((await tx`select count(*)::int as count from pg_trigger where tgname in('immutable_history','immutable_request_history','immutable_private_draft_history','immutable_request_proposal_source','immutable_notification_history') and tgenabled='O'`)[0].count).toBe(21);
  }));
});
