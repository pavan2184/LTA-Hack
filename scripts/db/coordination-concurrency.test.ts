// @vitest-environment node
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import type { CoordinationActionResult, PlannerCoordinationCase } from "@railplan/core/types/coordination";
import { createFixture, cleanupFixture, type E2EFixture } from "../e2e/fixtures";
import { createRequest, actOnRequest, getRequestCatalogue } from "@/lib/requests/service";
import { createPlan, getPlan, publishPlan } from "@/lib/plans/service";
import { createCase, actOnCase, getCase } from "@/lib/coordination/service";
import { withAuthenticatedTransaction, type VerifiedIdentity } from "@/lib/auth/session";

const identity = (id: string) => ({ id }) as VerifiedIdentity;
async function prepared(f: E2EFixture) {
  const planner = identity(f.users[0].id);
  const catalogue = await getRequestCatalogue(identity(f.users[1].id));
  const ids: string[] = [];
  for (const user of f.users.slice(1)) {
    const contractor = identity(user.id);
    const draft = await createRequest(contractor, { fields: { planningNight: f.night, title: "Isolated coordination race", description: "Fabricated concurrent test", workClass: "civil", blockIds: ["NS10-NS11"], durationMinutes: 15, preferredStart: 30, earliestStart: 0, latestEnd: 240, equipment: [], workforce: [{ roleId: catalogue.roles[0].id, count: 1 }] } });
    await actOnRequest(contractor, draft.id, { action: "submit", expectedVersion: 1, reason: "" });
    await actOnRequest(planner, draft.id, { action: "approve", expectedVersion: 2, reason: "Test review", approval: { teamId: "T-TRK", priority: "low", clearanceMinutes: 0, requiredSkills: [], dependencies: [], dependencyLagMinutes: 0, safetyConfirmed: true } });
    ids.push("R-" + draft.id);
  }
  const parameters = { planningNight: f.night, strategy: "balanced" as const, locked: ids.map((requestId, i) => ({ requestId, teamId: "T-TRK", startMinute: 120 + i * 30, endMinute: 135 + i * 30 })) };
  const source = await createPlan(planner, { ...parameters, locked: [] });
  const created = await createCase(planner, { sourcePlanId: source.id, selectedRequestIds: [ids[0]], idempotencyKey: randomUUID(), parameters }) as PlannerCoordinationCase;
  expect(created.confirmations.map(c => c.organisationId).sort()).toEqual([...f.orgs].sort());
  return { planner, parameters, source, created };
}

// The blocker is an independent transaction; pg_stat_activity proves actual
// overlap (distinct backend PIDs), rather than relying on Promise scheduling.
async function overlapping<T>(f: E2EFixture, work: () => Promise<T>[], beforeRelease?: (tx: TransactionSql) => Promise<void>) {
  let release!: () => void, acquired!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { acquired = resolve; });
  const blocker = f.sql.begin(async tx => {
    await tx`select * from railplan_private.planning_source for update`;
    if (beforeRelease) await beforeRelease(tx);
    acquired();
    await gate;
  });
  await Promise.race([ready, blocker]);
  const pending = Promise.allSettled(work());
  let pids: number[] = [];
  try {
    const until = Date.now() + 5000;
    while (pids.length < 2 && Date.now() < until) {
      const rows = await f.sql`select distinct pid from pg_stat_activity where wait_event_type='Lock' and (query like '%lock_planning_source%' or query like '%lock_coordination_case%')`;
      pids = rows.map(row => row.pid);
      if (pids.length < 2) await new Promise(resolve => setTimeout(resolve, 30));
    }
  } finally {
    release();
    await blocker;
  }
  const results = await pending;
  expect(pids.length).toBeGreaterThanOrEqual(2);
  return results;
}

describe("coordination independent-session races", { timeout: 60000 }, () => {
  it("revision and approval cannot attach confirmation to a revision the actor did not review", async () => {
    const f = await createFixture({ isolatedNight: true });
    try {
      const { planner, parameters, source, created } = await prepared(f);
      const results = await overlapping(f, () => [
        actOnCase(planner, created.id, { action: "revise", expectedVersion: 1, sourcePlanId: source.id, parameters }),
        actOnCase(planner, created.id, { action: "approve", expectedVersion: 1, revision: 1, organisationId: f.orgs[0], confirmedAt: "2026-09-14T00:00:00Z", note: "Reviewed revision one only" }),
      ]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(r => r.status === "rejected")).toMatchObject([{ reason: { code: "conflict" } }]);
      const saved = await getCase(planner, created.id) as PlannerCoordinationCase;
      expect(saved.events.filter(e => e.action === "approve").every(e => e.revision === 1)).toBe(true);
      if (saved.currentRevision === 1) {
        expect(saved.confirmations.find(c => c.organisationId === f.orgs[0])).toMatchObject({ revision: 1, status: "approved" });
        await actOnCase(planner, created.id, { action: "revise", expectedVersion: saved.version, sourcePlanId: source.id, parameters });
      }
      const revised = await getCase(planner, created.id);
      expect(revised.currentRevision).toBe(2);
      expect(revised.confirmations.every(c => c.revision === 2 && c.status === "pending")).toBe(true);
    } finally { await cleanupFixture(f); }
  });

  it.each([true, false])("double Apply creates exactly one plan (same idempotency key: %s)", async sameKey => {
    const f = await createFixture({ isolatedNight: true });
    try {
      const { planner, created } = await prepared(f);
      const key = randomUUID();
      const results = await overlapping<CoordinationActionResult>(f, () => [key, sameKey ? key : randomUUID()].map(idempotencyKey => actOnCase(planner, created.id, { action: "apply", expectedVersion: 1, revision: 1, idempotencyKey })));
      const successful = results.filter(r => r.status === "fulfilled").map(r => r.value);
      expect(successful).toHaveLength(sameKey ? 2 : 1);
      expect(new Set(successful.map(x => x.appliedPlanId)).size).toBe(1);
      if (!sameKey) expect(results.filter(r => r.status === "rejected")).toMatchObject([{ reason: { code: "conflict" } }]);
      const applications = await f.sql`select plan_id from railplan_private.coordination_applications where case_id=${created.id}`;
      expect(applications).toHaveLength(1);
      expect(applications[0].plan_id).toBe(successful[0].appliedPlanId);
      expect((await f.sql`select id from railplan_private.planning_runs where created_by=${planner.id}`)).toHaveLength(2);
      expect((await getPlan(planner, applications[0].plan_id)).publishState).toBe("draft");
      expect((await getCase(planner, created.id)).confirmations.every(c => c.status === "pending")).toBe(true);
    } finally { await cleanupFixture(f); }
  });

  it("committed source mutation rejects both overlapping Apply sessions without creating a stale plan", async () => {
    const f = await createFixture({ isolatedNight: true });
    try {
      const { planner, created } = await prepared(f);
      const results = await overlapping(f, () => [1, 2].map(() => actOnCase(planner, created.id, { action: "apply", expectedVersion: 1, revision: 1, idempotencyKey: randomUUID() })), async tx => {
        await tx`update public.workforce_availability set people_count=people_count+1 where planning_night=${f.night}::date`;
      });
      expect(results).toMatchObject([{ status: "rejected", reason: { code: "stale_plan" } }, { status: "rejected", reason: { code: "stale_plan" } }]);
      expect(await f.sql`select * from railplan_private.coordination_applications where case_id=${created.id}`).toHaveLength(0);
      expect(await f.sql`select id from railplan_private.planning_runs where created_by=${planner.id}`).toHaveLength(1);
      const fresh = await createPlan(planner, { planningNight: f.night, strategy: "balanced", locked: [] });
      expect(fresh.sourceRevision).not.toBe(created.proposals[0].sourceRevision);
    } finally { await cleanupFixture(f); }
  });

  it("source mutation waiting behind Apply makes the resulting draft unpublishable", async () => {
    const f = await createFixture({ isolatedNight: true });
    let mutation: Promise<unknown> | undefined;
    try {
      const { planner, created } = await prepared(f);
      const applied = await f.sql.begin(async tx => {
        const result = await actOnCase(planner, created.id, { action: "apply", expectedVersion: 1, revision: 1, idempotencyKey: randomUUID() }, tx);
        mutation = withAuthenticatedTransaction(planner, async db => {
          await db`update public.workforce_availability set people_count=people_count+1 where planning_night=${f.night}::date`;
        });
        // Attach rejection handling immediately, but retain the original outcome.
        void mutation.catch(() => {});
        let waiting = false;
        const until = Date.now() + 5000;
        while (!waiting && Date.now() < until) {
          const rows = await f.sql`select pid from pg_stat_activity where wait_event_type='Lock' and query like 'update public.workforce_availability%'`;
          waiting = rows.length > 0;
          if (!waiting) await new Promise(resolve => setTimeout(resolve, 30));
        }
        expect(waiting).toBe(true);
        return result;
      });
      await mutation;
      await expect(publishPlan(planner, applied.appliedPlanId!)).rejects.toMatchObject({ code: "stale_plan" });
      expect((await getPlan(planner, applied.appliedPlanId!)).publishState).toBe("draft");
      expect(await f.sql`select * from railplan_private.plan_publications where plan_id=${applied.appliedPlanId!}`).toHaveLength(0);
    } finally { try { await mutation; } finally { await cleanupFixture(f); } }
  });
});
