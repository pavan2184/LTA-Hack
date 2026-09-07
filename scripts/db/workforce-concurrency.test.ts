// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { connect } from "@/lib/db/client";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
const sql = connect();
afterAll(() => sql.end({ timeout: 1 }));
// Required separate suite: an absent database is a failure, never a skip.
await sql`select 1`;

describe("concurrent workforce night bounds (isolated committed fixtures)", () => {
  it.each(["availability-first", "resize-first"] as const)(
    "%s cannot leave committed out-of-night availability",
    async (ordering) => {
      const actorId = randomUUID(),
        identity = { id: actorId } as VerifiedIdentity;
      let night: string | undefined;
      let release: () => void = () => {};
      const running: Promise<unknown>[] = [];
      try {
        await sql.begin(async (tx) => {
          await tx`insert into auth.users(id) values(${actorId})`;
          await tx`insert into public.profiles(id,role) values(${actorId},'planner')`;
          const [free] = await tx<
            { night: string }[]
          >`select d::date::text as night from generate_series('2098-01-01'::date,'2098-12-31'::date,'1 day') d where not exists(select 1 from public.planning_nights n where n.planning_night=d::date) limit 1`;
          if (!free)
            throw new Error("No isolated workforce fixture night available");
          night = free.night;
          await tx`insert into public.planning_nights(planning_night,window_start_minute,window_end_minute,slot_minutes,minutes_per_block_hop,inter_line_transfer_minutes) values(${night},0,240,15,5,15)`;
        });
        let markAcquired!: () => void;
        const acquired = new Promise<void>((resolve) => {
          markAcquired = resolve;
        });
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const mutation = async (insert: boolean, hold: boolean) =>
          sql.begin("isolation level read committed", async (tx) =>
            withAuthenticatedTransaction(
              identity,
              async (db) => {
                if (insert)
                  await db`insert into public.workforce_availability(planning_night,team_id,role_id,start_minute,end_minute,people_count) values(${night!},'T-TRK','technician',0,240,4)`;
                else
                  await db`update public.planning_nights set window_end_minute=120 where planning_night=${night!}`;
                if (hold) {
                  markAcquired();
                  await gate;
                }
              },
              tx,
            ),
          );
        const first = mutation(ordering === "availability-first", true);
        running.push(first);
        // Surface a setup mutation failure instead of waiting forever for its gate.
        await Promise.race([acquired, first]);
        const second = mutation(ordering !== "availability-first", false);
        running.push(second);
        const settled = Promise.allSettled(running);
        let waiters = 0;
        const deadline = Date.now() + 5000;
        while (waiters < 1 && Date.now() < deadline) {
          const [row] = await sql<
            { count: number }[]
          >`select count(*)::integer as count from pg_stat_activity where wait_event_type='Lock' and (query like '%update public.planning_nights set window_end_minute=120%' or query like '%insert into public.workforce_availability%')`;
          waiters = row.count;
          if (!waiters) await new Promise((resolve) => setTimeout(resolve, 30));
        }
        release();
        const outcomes = await settled;
        expect(waiters).toBeGreaterThanOrEqual(1);
        expect(outcomes[0].status).toBe("fulfilled");
        expect(outcomes[1]).toMatchObject({
          status: "rejected",
          reason: { code: "23514" },
        });
        const invalid =
          await sql`select a.team_id from public.workforce_availability a join public.planning_nights n using(planning_night) where a.planning_night=${night!} and (a.start_minute<n.window_start_minute or a.end_minute>n.window_end_minute)`;
        expect(invalid).toEqual([]);
      } finally {
        release();
        await Promise.allSettled(running);
        // Exact dedicated-night/actor cleanup; this suite creates no saved plans
        // and needs no immutable-trigger bypass. A cleanup failure fails the test.
        await sql.begin(async (tx) => {
          await tx`set local lock_timeout='5s'`;
          if (night)
            await tx`delete from public.planning_nights where planning_night=${night}`;
          await tx`delete from auth.users where id=${actorId}`;
        });
      }
    },
    30000,
  );
});
