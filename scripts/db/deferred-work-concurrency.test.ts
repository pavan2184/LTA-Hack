// @vitest-environment node
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { createFixture, cleanupFixture, type E2EFixture } from "../e2e/fixtures";
import { createRequest, actOnRequest, getRequest } from "@/lib/requests/service";
import { createPlan, publishPlan } from "@/lib/plans/service";
import { recordDeferral, getWorkItem } from "@/lib/deferred-work/service";
import { prepareCarryForward } from "@/lib/deferred-work/carry-forward";
import type { VerifiedIdentity } from "@/lib/auth/session";
const identity = (id: string) => ({ id }) as VerifiedIdentity;
const approval = { teamId: "T-TRK", priority: "low" as const, clearanceMinutes: 0, requiredSkills: [], dependencies: [], dependencyLagMinutes: 0, safetyConfirmed: true as const };

async function source(f: E2EFixture) {
  const planner = identity(f.users[0].id), contractor = identity(f.users[1].id);
  const draft = await createRequest(contractor, { fields: { planningNight: f.night, title: "Isolated deferred race", description: "Intentionally unavailable staffing", workClass: "civil", blockIds: ["NS10-NS11"], durationMinutes: 15, preferredStart: 0, earliestStart: 0, latestEnd: 240, equipment: [], workforce: [{ roleId: "technician", count: 10000 }] } });
  await actOnRequest(contractor, draft.id, { action: "submit", expectedVersion: 1, reason: "" });
  await actOnRequest(planner, draft.id, { action: "approve", expectedVersion: 2, reason: "Reviewed race fixture", approval });
  const plan = await createPlan(planner, { planningNight: f.night, strategy: "balanced", locked: [] });
  expect(plan.deferred.map(d => d.requestId)).toContain("R-" + draft.id);
  const item = await recordDeferral(planner, { planId: plan.id, requestId: "R-" + draft.id, reason: "Race fixture", idempotencyKey: randomUUID() });
  return { planner, contractor, draft, plan, item };
}

// Each operation owns a real, distinct transaction/backend. Only those exact
// PIDs count as waiters; unrelated database traffic cannot satisfy this check.
async function overlap<T>(f: E2EFixture, operations: ((tx: TransactionSql) => Promise<T>)[]) {
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { locked = resolve; });
  const blocker = f.sql.begin(async tx => { await tx`select * from railplan_private.planning_source for update`; locked(); await gate; });
  await Promise.race([ready, blocker]);
  const pids: number[] = [];
  const pending = Promise.allSettled(operations.map(operation => f.sql.begin(async tx => {
    pids.push((await tx`select pg_backend_pid() as pid`)[0].pid);
    return operation(tx);
  })));
  let waiting = 0;
  try {
    const deadline = Date.now() + 5000;
    while (waiting < operations.length && Date.now() < deadline) {
      if (pids.length === operations.length) waiting = (await f.sql`select count(*)::int as count from pg_stat_activity where pid=any(${pids}::int[]) and wait_event_type='Lock'`)[0].count;
      if (waiting < operations.length) await new Promise(resolve => setTimeout(resolve, 25));
    }
  } finally { release(); await blocker; }
  const results = await pending;
  expect(new Set(pids).size).toBe(operations.length);
  expect(waiting).toBe(operations.length);
  return results;
}

describe("deferred-work independent-session races", { timeout: 90000 }, () => {
  it("double preparation commits one draft and both retries return its ID", async () => {
    const f = await createFixture({ isolatedNight: true });
    const target = await createFixture({ isolatedNight: true });
    try {
      const s = await source(f);
      const command = { expectedVersion: s.item.version, targetNight: target.night, idempotencyKey: randomUUID() };
      const results = await overlap(f, [1, 2].map(() => tx => prepareCarryForward(s.planner, s.item.id, command, tx)));
      expect(results.every(r => r.status === "fulfilled")).toBe(true);
      const ids = results.flatMap(r => r.status === "fulfilled" ? [r.value.requestId] : []);
      expect(new Set(ids).size).toBe(1);
      expect(await f.sql`select submission_id from railplan_private.carry_forward_preparations where work_item_id=${s.item.id}`).toHaveLength(1);
      expect((await getRequest(s.planner, ids[0])).activeApprovedRevision).toBeNull();
    } finally { await cleanupFixture(f); await cleanupFixture(target); }
  });
  it("two target approvals cannot leave two active approved occurrences", async () => {
    const f = await createFixture({ isolatedNight: true });
    const targets = [await createFixture({ isolatedNight: true }), await createFixture({ isolatedNight: true })];
    try {
      const s = await source(f), ids: string[] = [];
      for (const target of targets) {
        const prepared = await prepareCarryForward(s.planner, s.item.id, { expectedVersion: (await getWorkItem(s.planner, s.item.id)).version!, targetNight: target.night, idempotencyKey: randomUUID() });
        await actOnRequest(s.contractor, prepared.requestId, { action: "submit", expectedVersion: 1, reason: "" });
        ids.push(prepared.requestId);
      }
      const review = { expectedWorkVersion: (await getWorkItem(s.planner, s.item.id)).version!, dependenciesReviewed: true as const };
      const results = await overlap(f, ids.map(id => tx => actOnRequest(s.planner, id, { action: "approve", expectedVersion: 2, reason: "Reviewed one transfer", approval, carryForward: review }, tx)));
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(r => r.status === "rejected")).toMatchObject([{ reason: { code: "conflict" } }]);
      expect(await f.sql`select s.id from railplan_private.request_submissions s join railplan_private.work_item_submissions l on l.submission_id=s.id where l.work_item_id=${s.item.id} and s.active_approved_version is not null`).toHaveLength(1);
      const [{ facts }] = await f.sql`select facts from railplan_private.planning_runs where id=${s.plan.id}`;
      expect(facts.requests.some((r: { id: string }) => r.id === "R-" + s.draft.id)).toBe(true);
      expect((await getRequest(s.planner, s.draft.id)).activeApprovedRevision).toBeNull();
    } finally { await cleanupFixture(f); for (const target of targets) await cleanupFixture(target); }
  });
  it("approval versus publication cannot retire an unconfirmed newly published source", async () => {
    const f = await createFixture({ isolatedNight: true });
    const target = await createFixture({ isolatedNight: true });
    try {
      const s = await source(f);
      const prepared = await prepareCarryForward(s.planner, s.item.id, { expectedVersion: s.item.version, targetNight: target.night, idempotencyKey: randomUUID() });
      await actOnRequest(s.contractor, prepared.requestId, { action: "submit", expectedVersion: 1, reason: "" });
      const review = { expectedWorkVersion: (await getWorkItem(s.planner, s.item.id)).version!, dependenciesReviewed: true as const };
      const results = await overlap<unknown>(f, [
        tx => actOnRequest(s.planner, prepared.requestId, { action: "approve", expectedVersion: 2, reason: "No publication observed", approval, carryForward: review }, tx),
        tx => publishPlan(s.planner, s.plan.id, tx),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      const failure = results.find(r => r.status === "rejected");
      expect(failure?.status === "rejected" && ["conflict", "stale_plan", "invalid_request"].includes(failure.reason.code)).toBe(true);
      expect(await f.sql`select s.id from railplan_private.request_submissions s join railplan_private.work_item_submissions l on l.submission_id=s.id where l.work_item_id=${s.item.id} and s.active_approved_version is not null`).toHaveLength(1);
    } finally { await cleanupFixture(f); await cleanupFixture(target); }
  });
  it("publication retries record one occurrence and retain the original deferral note", async () => {
    const f = await createFixture({ isolatedNight: true });
    try {
      const s = await source(f);
      const results = await overlap(f, [1, 2].map(() => tx => publishPlan(s.planner, s.plan.id, tx)));
      expect(results.every(r => r.status === "fulfilled")).toBe(true);
      expect(await f.sql`select id from railplan_private.work_item_events where work_item_id=${s.item.id} and publication_id=${s.plan.id}`).toHaveLength(1);
      const saved = await getWorkItem(s.planner, s.item.id);
      expect(saved.deferredCount).toBe(1);
      expect(saved.events?.some(e => e.note === "Race fixture")).toBe(true);
    } finally { await cleanupFixture(f); }
  });
});
