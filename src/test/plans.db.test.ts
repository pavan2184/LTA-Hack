// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { connect } from "@/lib/db/client";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import {
  createPlan,
  getPlan,
  listPlans,
  publishPlan,
  recordDecision,
} from "@/lib/plans/service";
import { PLANNING_NIGHT } from "@railplan/core/data/requests";
const sql = connect();
const reachable = await sql`select 1`.then(
  () => true,
  () => false,
);
afterAll(() => sql.end({ timeout: 1 }));
if (!reachable)
  console.warn(
    "Plan database tests skipped: database unavailable; test:db remains required.",
  );
const identity = (id: string) => ({ id }) as VerifiedIdentity;
const rollback = new Error("rollback plan fixtures");
const input = {
  planningNight: PLANNING_NIGHT,
  strategy: "balanced" as const,
  locked: [],
};
async function fixture(
  work: (
    tx: TransactionSql,
    planner: VerifiedIdentity,
    contractor: VerifiedIdentity,
  ) => Promise<void>,
) {
  await expect(
    sql.begin("isolation level repeatable read", async (tx) => {
      const planner = randomUUID(),
        contractor = randomUUID(),
        org = randomUUID();
      await tx`insert into auth.users(id) values(${planner}),(${contractor})`;
      await tx`insert into public.contractor_organisations(id,name) values(${org},'Plan rollback fixture')`;
      await tx`insert into public.profiles(id,role,contractor_organisation_id) values(${planner},'planner',null),(${contractor},'contractor',${org})`;
      await work(tx, identity(planner), identity(contractor));
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}
describe.skipIf(!reachable)(
  "durable plans under real authenticated SQL (rollback)",
  () => {
    it("never publishes a fresh plan that cannot staff mandatory work", async () => {
      await fixture(async (tx, planner) => {
        await withAuthenticatedTransaction(planner, async (db) => {
          await db`update public.workforce_availability set people_count=0 where planning_night=${PLANNING_NIGHT}`;
        }, tx);
        const plan = await createPlan(planner, input, tx);
        expect(plan.status).toBe("INFEASIBLE");
        expect(plan.deferred.some((d) => d.bindingRuleIds.includes("WORKFORCE_CAPACITY"))).toBe(true);
        await expect(publishPlan(planner, plan.id, tx)).rejects.toMatchObject({ code: "invalid_plan" });
        expect((await getPlan(planner, plan.id, tx)).publishState).toBe("draft");
        expect(await tx`select * from railplan_private.plan_publications where plan_id=${plan.id}`).toEqual([]);
      });
    });
    it("snapshots aggregate workforce and rejects publication after supply or demand changes", async () => {
      await fixture(async (tx, planner) => {
        const first = await createPlan(planner, input, tx);
        const [before] = await tx`select facts from railplan_private.planning_runs where id=${first.id}`;
        expect(before.facts.workforceAvailability.length).toBeGreaterThan(0);
        expect(before.facts.workforceDemand.length).toBeGreaterThan(0);
        await tx`update public.workforce_availability set people_count=people_count+1
          where planning_night=${PLANNING_NIGHT} and team_id='T-TRK'`;
        await expect(publishPlan(planner, first.id, tx)).rejects.toMatchObject({ code: "stale_plan" });
        const second = await createPlan(planner, input, tx);
        expect(second.inputDigest).not.toBe(first.inputDigest);
        expect(BigInt(second.sourceRevision)).toBeGreaterThan(BigInt(first.sourceRevision));
        await tx`update public.request_workforce_demand set people_count=people_count+1 where request_id='M-001'`;
        await expect(publishPlan(planner, second.id, tx)).rejects.toMatchObject({ code: "stale_plan" });
        const third = await createPlan(planner, input, tx);
        expect(third.inputDigest).not.toBe(second.inputDigest);
        const [after] = await tx`select facts from railplan_private.planning_runs where id=${first.id}`;
        expect(after.facts).toEqual(before.facts);
        expect(await getPlan(planner, first.id, tx)).toEqual(first);
        for (const plan of [first, second]) {
          expect(await tx`select action,actor_id from railplan_private.plan_audit_events
            where plan_id=${plan.id} and action='rejected_stale'`)
            .toEqual([{ action: "rejected_stale", actor_id: planner.id }]);
        }
      });
    });
    it("roundtrips immutable normalized output, provenance and calculated metrics", async () => {
      await fixture(async (tx, planner) => {
        const plan = await createPlan(planner, input, tx);
        expect(plan.placements.length).toBeGreaterThan(0);
        expect(plan.inputDigest).toMatch(/^sha256:/);
        expect(plan.validation.independentlyValidated).toBe(true);
        expect(await getPlan(planner, plan.id, tx)).toEqual(plan);
        expect(
          (await listPlans(planner, PLANNING_NIGHT, tx)).map((p) => p.id),
        ).toContain(plan.id);
        const [run] =
          await tx`select result from railplan_private.planning_runs where id=${plan.id}`;
        expect(run.result.plan).toBeUndefined();
        expect(
          (
            await tx`select request_id from railplan_private.plan_placements where plan_id=${plan.id}`
          ).length,
        ).toBe(plan.placements.length);
        expect(
          await tx`select action,actor_id from railplan_private.plan_audit_events where plan_id=${plan.id}`,
        ).toEqual([{ action: "create", actor_id: planner.id }]);
      });
    });
    it("records authenticated decisions/publications/supersession without changing snapshots", async () => {
      await fixture(async (tx, planner) => {
        const first = await createPlan(planner, input, tx);
        const second = await createPlan(
          planner,
          { ...input, strategy: "min-risk" },
          tx,
        );
        const decision = await recordDecision(
          planner,
          first.id,
          { kind: "accept", reason: "Reviewed fabricated inputs" },
          tx,
        );
        expect(decision.createdBy).toBe(planner.id);
        const published = await publishPlan(planner, first.id, tx);
        expect(published.publishState).toBe("published");
        expect((await publishPlan(planner, second.id, tx)).publishState).toBe(
          "published",
        );
        const old = await getPlan(planner, first.id, tx);
        expect(old.publishState).toBe("superseded");
        expect(old.supersededBy).toBe(second.id);
        expect(old.placements).toEqual(first.placements);
        expect(old.metrics).toEqual(first.metrics);
        expect(old.createdAt).toBe(first.createdAt);
        expect((await publishPlan(planner, first.id, tx)).publishState).toBe(
          "superseded",
        );
        const actions =
          await tx`select action,actor_id from railplan_private.plan_audit_events where plan_id=${first.id} order by created_at`;
        expect(actions.map((a) => a.action)).toEqual([
          "create",
          "decision",
          "publish",
          "supersede",
        ]);
        expect(actions.every((a) => a.actor_id === planner.id)).toBe(true);
      });
    });
    it("keeps rejection audit after stale error; request and child/resource changes advance source", async () => {
      await fixture(async (tx, planner) => {
        const plan = await createPlan(planner, input, tx);
        await tx`update public.maintenance_requests set description=description || ' revision probe' where id='M-001'`;
        await expect(publishPlan(planner, plan.id, tx)).rejects.toMatchObject({
          code: "stale_plan",
        });
        expect((await getPlan(planner, plan.id, tx)).publishState).toBe(
          "draft",
        );
        expect(
          await tx`select action,actor_id from railplan_private.plan_audit_events where plan_id=${plan.id} and action='rejected_stale'`,
        ).toEqual([{ action: "rejected_stale", actor_id: planner.id }]);
        const revised = await createPlan(planner, input, tx);
        expect(BigInt(revised.sourceRevision)).toBeGreaterThan(
          BigInt(plan.sourceRevision),
        );
        await tx`update public.request_required_skills set skill=skill where request_id='M-001'`;
        await expect(
          publishPlan(planner, revised.id, tx),
        ).rejects.toMatchObject({ code: "stale_plan" });
        const current = await createPlan(planner, input, tx);
        await tx`update public.equipment_types set units=units where id='E-THM'`;
        await expect(
          publishPlan(planner, current.id, tx),
        ).rejects.toMatchObject({ code: "stale_plan" });
      });
    });
    it("denies direct writes/deletes even to published children and authenticated audit forgery", async () => {
      await fixture(async (tx, planner) => {
        const plan = await createPlan(planner, input, tx);
        await publishPlan(planner, plan.id, tx);
        for (const table of [
          "planning_runs",
          "plan_placements",
          "plan_deferrals",
          "planner_decisions",
          "plan_publications",
          "plan_audit_events",
        ]) {
          await expect(
            tx.savepoint(async (probe) => {
              await probe`delete from ${probe("railplan_private." + table)}`;
            }),
          ).rejects.toMatchObject({ code: "42501" });
        }
        await expect(
          tx.savepoint(async (probe) => {
            await probe`insert into railplan_private.plan_audit_events(plan_id,action,actor_id) values(${plan.id},'publish',${planner.id})`;
          }),
        ).rejects.toMatchObject({ code: "42501" });
        await tx`reset role`;
        await expect(
          tx.savepoint(async (probe) => {
            await probe`update railplan_private.planning_runs set input_digest=input_digest where id=${plan.id}`;
          }),
        ).rejects.toMatchObject({ code: "42501" });
      });
    });
    it("blocks contractors and anonymous callers including private functions and entire plan data", async () => {
      await fixture(async (tx, planner, contractor) => {
        const plan = await createPlan(planner, input, tx);
        await expect(getPlan(contractor, plan.id, tx)).rejects.toMatchObject({
          code: "forbidden",
        });
        await expect(createPlan(contractor, input, tx)).rejects.toMatchObject({
          code: "forbidden",
        });
        await expect(
          publishPlan(contractor, plan.id, tx),
        ).rejects.toMatchObject({ code: "forbidden" });
        await withAuthenticatedTransaction(
          contractor,
          async (db) => {
            expect(
              await db`select id from railplan_private.planning_runs`,
            ).toEqual([]);
            expect(
              await db`select id from railplan_private.plan_audit_events`,
            ).toEqual([]);
            await expect(
              db.savepoint(async (probe) => {
                await probe`select railplan_private.publish_generated_plan(${plan.id}::uuid)`;
              }),
            ).rejects.toMatchObject({ code: "42501" });
            await db`update public.equipment_types set units=units+1 where id='E-THM'`;
          },
          tx,
        );
        // Denied no-op contractor writes must not advance the source revision.
        expect((await publishPlan(planner, plan.id, tx)).publishState).toBe(
          "published",
        );
        await tx`set local role anon`;
        await expect(
          tx.savepoint(async (probe) => {
            await probe`select * from railplan_private.planning_runs`;
          }),
        ).rejects.toMatchObject({ code: "42501" });
      });
    });
    it("refuses infeasible runs and runtime-invalid pins and missing nights", async () => {
      await fixture(async (tx, planner) => {
        await expect(
          createPlan(planner, { ...input, planningNight: "2099-01-01" }, tx),
        ).rejects.toMatchObject({ code: "not_found" });
        await expect(
          createPlan(
            planner,
            {
              ...input,
              locked: [
                {
                  requestId: "absent",
                  teamId: "T-TRK",
                  startMinute: 0,
                  endMinute: 60,
                },
              ],
            },
            tx,
          ),
        ).rejects.toMatchObject({ code: "invalid_request" });
        await withAuthenticatedTransaction(
          planner,
          async (db) => {
            await db`update public.teams set shift_end=1`;
          },
          tx,
        );
        const plan = await createPlan(planner, input, tx);
        expect(plan.status).toBe("INFEASIBLE");
        await expect(publishPlan(planner, plan.id, tx)).rejects.toMatchObject({
          code: "invalid_plan",
        });
      });
    });
  },
);
