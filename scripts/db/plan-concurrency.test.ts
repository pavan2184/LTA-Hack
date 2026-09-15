// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { connect } from "@/lib/db/client";
import { createPlan, getPlan, publishPlan } from "@/lib/plans/service";
import type { PlanVersion } from "@railplan/core/types/plans";
import type { VerifiedIdentity } from "@/lib/auth/session";
const sql = connect();
const reachable = await sql`select 1`.then(
  () => true,
  () => false,
);
afterAll(() => sql.end({ timeout: 1 }));
if (!reachable)
  throw new Error("Required plan concurrency database is unavailable.");

describe("concurrent plan publication (isolated committed fixtures)", () => {
  it("serializes two first publications into one immutable supersession chain", async () => {
    const actorId = randomUUID(),
      requestId = "TEST-" + randomUUID();
    const identity = { id: actorId } as VerifiedIdentity;
    let night: string | undefined;
    let inFlight: Promise<PromiseSettledResult<PlanVersion>[]> | undefined;
    try {
      await sql.begin(async (tx) => {
        await tx`insert into auth.users(id) values(${actorId})`;
        await tx`insert into public.profiles(id,role) values(${actorId},'planner')`;
        const [free] = await tx<
          { night: string }[]
        >`select d::date::text as night from generate_series('2099-01-01'::date,'2099-12-31'::date,'1 day') d where not exists(select 1 from public.planning_nights n where n.planning_night=d::date) limit 1`;
        if (!free) throw new Error("No isolated fixture night available");
        night = free.night;
        await tx`insert into public.planning_nights select ${night}::date,window_start_minute,window_end_minute,slot_minutes,minutes_per_block_hop,inter_line_transfer_minutes from public.planning_nights order by planning_night limit 1`;
        await tx`insert into public.maintenance_requests(id,planning_night,title,short_title,work_type,work_class,sector,duration_minutes,clearance_minutes,priority,team_id,preferred_start,earliest_start,latest_end,dependency_lag_minutes,description)
      select ${requestId},${night}::date,title,short_title,work_type,work_class,sector,duration_minutes,clearance_minutes,priority,team_id,preferred_start,earliest_start,latest_end,dependency_lag_minutes,description from public.maintenance_requests where id='M-001'`;
        await tx`insert into public.request_blocks select ${requestId},block_id,position from public.request_blocks where request_id='M-001'`;
        await tx`insert into public.request_required_skills select ${requestId},skill from public.request_required_skills where request_id='M-001'`;
        await tx`insert into public.request_equipment select ${requestId},equipment_id,units from public.request_equipment where request_id='M-001'`;
        await tx`insert into public.request_workforce_demand select ${requestId},role_id,people_count from public.request_workforce_demand where request_id='M-001'`;
        await tx`insert into public.workforce_availability
          select ${night}::date,a.team_id,a.role_id,a.start_minute,a.end_minute,a.people_count
          from public.workforce_availability a join public.maintenance_requests r
          on r.team_id=a.team_id and r.planning_night=a.planning_night where r.id='M-001'`;
      });
      const input = {
        planningNight: night!,
        strategy: "balanced" as const,
        locked: [],
      };
      const first = await createPlan(identity, input),
        second = await createPlan(identity, input);
      // Hold the source row before both requests enter their transactions. Both
      // establish their profile snapshots while blocked. The first commit changes
      // lock_generation; the other must retry from BEGIN to see its publication.
      let release!: () => void, locked!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const acquired = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const blocker = sql.begin(async (tx) => {
        await tx`select * from railplan_private.planning_source for update`;
        locked();
        await gate;
      });
      await acquired;
      inFlight = Promise.allSettled([
        publishPlan(identity, first.id),
        publishPlan(identity, second.id),
      ]);
      // Poll pg_stat_activity for both database calls waiting on the source lock.
      // A deadline keeps a failed overlap assertion from leaking a held lock.
      let waiters = 0;
      try {
        const deadline = Date.now() + 5000;
        while (waiters < 2 && Date.now() < deadline) {
          const [row] = await sql<
            { count: number }[]
          >`select count(*)::integer as count from pg_stat_activity where wait_event_type='Lock' and query like '%lock_planning_source%'`;
          waiters = row.count;
          if (waiters < 2)
            await new Promise((resolve) => setTimeout(resolve, 30));
        }
      } finally {
        release();
        await blocker;
      }
      const outcomes = await inFlight;
      expect(outcomes.every((result) => result.status === "fulfilled")).toBe(
        true,
      );
      expect(waiters).toBeGreaterThanOrEqual(2);
      const versions = await Promise.all([
        getPlan(identity, first.id),
        getPlan(identity, second.id),
      ]);
      expect(versions.map((v) => v.publishState).sort()).toEqual([
        "published",
        "superseded",
      ]);
      const old = versions.find((v) => v.publishState === "superseded")!,
        current = versions.find((v) => v.publishState === "published")!;
      expect(old.supersededBy).toBe(current.id);
      const events =
        await sql`select action,actor_id from railplan_private.plan_audit_events where plan_id in (${first.id},${second.id})`;
      expect(events.filter((e) => e.action === "publish")).toHaveLength(2);
      expect(events.filter((e) => e.action === "supersede")).toHaveLength(1);
      expect(events.every((e) => e.actor_id === actorId)).toBe(true);
    } finally {
      await inFlight;
      // True cross-session visibility needs committed fixtures. Maintenance-only
      // cleanup is exact-ID, transactional, short-lock-timeout, and restores every
      // immutable trigger before commit. Any failure rolls the entire cleanup back
      // and fails the test visibly; no broad deletes or lasting trigger changes.
      await sql.begin(async (tx) => {
        await tx`set local lock_timeout='5s'`;
        const tables = [
          "planning_runs",
          "plan_placements",
          "plan_deferrals",
          "planner_decisions",
          "plan_publications",
          "plan_audit_events",
          "work_item_events",
          "work_item_mutations",
          "work_item_submissions",
          "carry_forward_preparations",
        ];
        for (const table of [...tables, "work_items", "work_item_active_occurrences"].sort())
          await tx`lock table ${tx("railplan_private." + table)} in access exclusive mode`;
        const rows = await tx<
          { id: string }[]
        >`select id from railplan_private.planning_runs where created_by=${actorId}`;
        const ids = rows.map((row) => row.id);
        if (ids.length) {
          for (const table of tables)
            await tx`alter table ${tx("railplan_private." + table)} disable trigger immutable_history`;
          for (const table of ["carry_forward_preparations", "work_item_active_occurrences", "work_item_events", "work_item_mutations", "work_item_submissions"])
            await tx.unsafe(`delete from railplan_private.${table} where work_item_id in(select id from railplan_private.work_items where created_by=$1::uuid)`, [actorId]);
          await tx`delete from railplan_private.work_items where created_by=${actorId}`;
          for (const table of [
            "plan_audit_events",
            "planner_decisions",
            "plan_placements",
            "plan_deferrals",
            "plan_publications",
          ])
            await tx`delete from ${tx("railplan_private." + table)} where plan_id in ${tx(ids)}`;
          await tx`delete from railplan_private.planning_runs where id in ${tx(ids)}`;
          for (const table of tables)
            await tx`alter table ${tx("railplan_private." + table)} enable trigger immutable_history`;
        }
        await tx`delete from public.maintenance_requests where id=${requestId}`;
        if (night)
          await tx`delete from public.planning_nights where planning_night=${night}`;
        await tx`delete from auth.users where id=${actorId}`;
      });
    }
  }, 30000);
});
