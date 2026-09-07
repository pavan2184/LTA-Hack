// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import {
  buildInstanceFromLiterals,
  assertInstancesMatch,
  instanceDigest,
} from "@railplan/core/domain/instance";
import { connect } from "@/lib/db/client";
import { loadPlanningInstance } from "@/lib/db/instance";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
const sql = connect(),
  instance = buildInstanceFromLiterals();
const reachable = await sql`select 1`.then(
  () => true,
  () => false,
);
afterAll(() => sql.end({ timeout: 1 }));
if (!reachable)
  console.warn(
    "Workforce database tests skipped: database unavailable; test:db remains required.",
  );
const identity = (id: string) => ({ id }) as VerifiedIdentity;
const rollback = new Error("rollback workforce facts");
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
      await tx`insert into public.contractor_organisations(id,name) values(${org},'Workforce rollback fixture')`;
      await tx`insert into public.profiles(id,role,contractor_organisation_id) values(${planner},'planner',null),(${contractor},'contractor',${org})`;
      await work(tx, identity(planner), identity(contractor));
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}
describe.skipIf(!reachable)("workforce database facts (rollback)", () => {
  it("roundtrips complete roles/supply/demand and digest under planner RLS", async () => {
    await fixture(async (tx, planner) => {
      await withAuthenticatedTransaction(
        planner,
        async (db) => {
          const loaded = await loadPlanningInstance(db, instance.planningNight);
          expect(loaded.workforceRoles).toEqual(instance.workforceRoles);
          expect(loaded.workforceAvailability).toEqual(
            instance.workforceAvailability,
          );
          expect(loaded.workforceDemand).toEqual(instance.workforceDemand);
          assertInstancesMatch(instance, loaded);
          await db`update workforce_availability set people_count=people_count+1 where team_id='T-TRK' and role_id='technician' and planning_night=${instance.planningNight}`;
          expect(
            instanceDigest(
              await loadPlanningInstance(db, instance.planningNight),
            ),
          ).not.toBe(instanceDigest(instance));
        },
        tx,
      );
    });
  });
  it("rejects invalid people counts, IDs, dates and inverted/outside windows", async () => {
    await fixture(async (tx, planner) => {
      await withAuthenticatedTransaction(
        planner,
        async (db) => {
          // Remove one key in the rollback fixture to isolate each constraint rather than duplicate-key failure.
          await db`delete from workforce_availability where planning_night=${instance.planningNight} and team_id='T-TRK' and role_id='technician'`;
          const base = {
            planning_night: instance.planningNight,
            team_id: "T-TRK",
            role_id: "technician",
            start_minute: 0,
            end_minute: 240,
            people_count: 4,
          };
          for (const [change, code] of [
            [{ people_count: -1 }, "23514"],
            [{ people_count: 10001 }, "23514"],
            [{ people_count: 1.5 }, "22P02"],
            [{ team_id: "unknown" }, "23503"],
            [{ role_id: "unknown" }, "23503"],
            [{ planning_night: "2099-12-31" }, "23503"],
            [{ start_minute: 120, end_minute: 120 }, "23514"],
            [{ start_minute: -1 }, "23514"],
            [{ end_minute: 241 }, "23514"],
          ] as const) {
            await expect(
              db.savepoint(async (probe) => {
                await probe`insert into workforce_availability ${probe({ ...base, ...change })}`;
              }),
            ).rejects.toMatchObject({ code });
          }
          await db`delete from request_workforce_demand where request_id='M-001' and role_id='technician'`;
          for (const [change, code] of [
            [{ people_count: 0 }, "23514"],
            [{ people_count: 10001 }, "23514"],
            [{ people_count: 1.5 }, "22P02"],
            [{ role_id: "unknown" }, "23503"],
            [{ request_id: "unknown" }, "23503"],
          ] as const) {
            await expect(
              db.savepoint(async (probe) => {
                await probe`insert into request_workforce_demand ${probe({ request_id: "M-001", role_id: "technician", people_count: 2, ...change })}`;
              }),
            ).rejects.toMatchObject({ code });
          }
          await expect(
            db.savepoint(async (probe) => {
              await probe`insert into workforce_roles(id,name) values('','empty')`;
            }),
          ).rejects.toMatchObject({ code: "23514" });
        },
        tx,
      );
    });
  });
  it("accepts adjacent absolute supply windows and rejects overlaps/duplicate demand", async () => {
    await fixture(async (tx, planner) => {
      await withAuthenticatedTransaction(
        planner,
        async (db) => {
          await db`delete from workforce_availability where planning_night=${instance.planningNight} and team_id='T-TRK' and role_id='technician'`;
          await db`insert into workforce_availability values(${instance.planningNight},'T-TRK','technician',0,120,0),(${instance.planningNight},'T-TRK','technician',120,240,4)`;
          await expect(
            db.savepoint(async (probe) => {
              await probe`insert into workforce_availability values(${instance.planningNight},'T-TRK','technician',60,180,3)`;
            }),
          ).rejects.toMatchObject({ code: "23P01" });
          await expect(
            db.savepoint(async (probe) => {
              await probe`update workforce_availability set end_minute=130 where planning_night=${instance.planningNight} and team_id='T-TRK' and role_id='technician' and start_minute=0`;
            }),
          ).rejects.toMatchObject({ code: "23P01" });
          await expect(
            db.savepoint(async (probe) => {
              await probe`insert into request_workforce_demand values('M-001','technician',1)`;
            }),
          ).rejects.toMatchObject({ code: "23505" });
        },
        tx,
      );
    });
  });
  it("rejects parent-night shrinkage that would strand availability, including changed start", async () => {
    await fixture(async (tx, planner) => {
      await withAuthenticatedTransaction(
        planner,
        async (db) => {
          for (const change of [
            { window_end_minute: 230 },
            { window_start_minute: 1 },
          ])
            await expect(
              db.savepoint(async (probe) => {
                await probe`update planning_nights set ${probe(change)} where planning_night=${instance.planningNight}`;
              }),
            ).rejects.toMatchObject({ code: "23514" });
          await db`delete from workforce_availability where planning_night=${instance.planningNight}`;
          await db`update planning_nights set window_end_minute=230 where planning_night=${instance.planningNight}`;
        },
        tx,
      );
    });
  });
  it("filters demand and availability to the selected night", async () => {
    await fixture(async (tx, planner) => {
      await withAuthenticatedTransaction(
        planner,
        async (db) => {
          await db`insert into planning_nights select '2099-12-30'::date,window_start_minute,window_end_minute,slot_minutes,minutes_per_block_hop,inter_line_transfer_minutes from planning_nights where planning_night=${instance.planningNight}`;
          await db`insert into workforce_availability values('2099-12-30','T-TRK','technician',0,240,99)`;
          const other = await loadPlanningInstance(db, "2099-12-30");
          expect(other.workforceAvailability).toHaveLength(1);
          expect(other.workforceDemand).toEqual([]);
          expect(other.workforceRoles).toEqual(instance.workforceRoles);
          assertInstancesMatch(
            instance,
            await loadPlanningInstance(db, instance.planningNight),
          );
        },
        tx,
      );
    });
  });
  it("denies contractor/anonymous reads and mutations on all workforce tables", async () => {
    await fixture(async (tx, planner, contractor) => {
      await withAuthenticatedTransaction(
        contractor,
        async (db) => {
          for (const table of [
            "workforce_roles",
            "workforce_availability",
            "request_workforce_demand",
          ]) {
            expect(await db`select * from ${db(table)}`).toEqual([]);
            expect(await db`delete from ${db(table)} returning *`).toEqual([]);
          }
          await expect(
            db.savepoint(async (probe) => {
              await probe`insert into workforce_roles(id,name) values('forged','Forged')`;
            }),
          ).rejects.toMatchObject({ code: "42501" });
        },
        tx,
      );
      await withAuthenticatedTransaction(
        planner,
        async (db) => {
          assertInstancesMatch(
            instance,
            await loadPlanningInstance(db, instance.planningNight),
          );
        },
        tx,
      );
      await tx`set local role anon`;
      for (const table of [
        "workforce_roles",
        "workforce_availability",
        "request_workforce_demand",
      ])
        await expect(
          tx.savepoint(async (probe) => {
            await probe`select * from ${probe(table)}`;
          }),
        ).rejects.toMatchObject({ code: "42501" });
    });
  });
});
