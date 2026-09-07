// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { connect } from "@/lib/db/client";
import { withAuthenticatedTransaction, type VerifiedIdentity } from "@/lib/auth/session";

const sql = connect();
const reachable = await sql`select 1`.then(() => true, () => false);
afterAll(() => sql.end({ timeout: 1 }));
if (!reachable) console.warn("Auth database tests skipped: database unavailable; test:db remains a required gate.");
const rollback = new Error("rollback auth fixtures");
async function fixture(work: (tx: TransactionSql, ids: { planner: string; contractor: string; other: string; unassigned: string; org: string; otherOrg: string }) => Promise<void>) {
  await expect(sql.begin(async tx => {
    const ids = { planner: randomUUID(), contractor: randomUUID(), other: randomUUID(), unassigned: randomUUID(), org: randomUUID(), otherOrg: randomUUID() };
    for (const id of [ids.planner, ids.contractor, ids.other, ids.unassigned]) {
      await tx`insert into auth.users(id, raw_user_meta_data) values (${id}, '{"role":"planner"}')`;
    }
    await tx`insert into public.contractor_organisations(id,name) values (${ids.org},'Rollback organisation A'), (${ids.otherOrg},'Rollback organisation B')`;
    await tx`insert into public.profiles(id,role,contractor_organisation_id) values (${ids.planner},'planner',null), (${ids.contractor},'contractor',${ids.org}), (${ids.other},'contractor',${ids.otherOrg})`;
    await work(tx, ids);
    throw rollback;
  })).rejects.toBe(rollback);
}
const identity = (id: string) => ({ id }) as VerifiedIdentity;

describe.skipIf(!reachable)("database role matrix (rollback fixtures)", () => {
  it("planner reads and manages planning facts under authenticated RLS", async () => {
    await fixture(async (tx, ids) => {
      await withAuthenticatedTransaction(identity(ids.planner), async (db, actor) => {
        expect(actor.role).toBe("planner");
        const [session] = await db`select current_user as role, auth.uid() as id`;
        expect(session).toMatchObject({ role: "authenticated", id: ids.planner });
        expect((await db`select * from maintenance_requests`).length).toBe(22);
        expect((await db`update equipment_types set units = units + 1 where id = 'E-THM' returning id`).length).toBe(1);
        expect((await db`select * from contractor_organisations`).length).toBeGreaterThanOrEqual(2);
      }, tx);
    });
  });
  it("contractor sees only its profile and organisation, no planning facts or writes", async () => {
    await fixture(async (tx, ids) => {
      await withAuthenticatedTransaction(identity(ids.contractor), async (db, actor) => {
        expect(actor.role).toBe("contractor"); // forged user_metadata was ignored
        expect(await db`select id from profiles`).toEqual([{ id: ids.contractor }]);
        expect(await db`select id from contractor_organisations`).toEqual([{ id: ids.org }]);
        expect(await db`select id from maintenance_requests`).toEqual([]);
        expect(await db`update equipment_types set units = 999 where id = 'E-THM' returning id`).toEqual([]);
        await expect(db.savepoint(async probe => { await probe`update profiles set role = 'planner', contractor_organisation_id = null where id = ${ids.contractor}`; })).rejects.toMatchObject({ code: "42501" });
        await expect(db.savepoint(async probe => { await probe`insert into equipment_types(id,name,units,turnaround_minutes) values ('E-TEST','forbidden',1,0)`; })).rejects.toMatchObject({ code: "42501" });
        await expect(db.savepoint(async probe => { await probe`select * from railplan_private.consume_assistant_token()`; })).rejects.toMatchObject({ code: "42501" });
      }, tx);
    });
  });
  it("an authenticated unassigned user is denied despite forged planner metadata", async () => {
    await fixture(async (tx, ids) => {
      await expect(withAuthenticatedTransaction(identity(ids.unassigned), async () => null, tx)).rejects.toMatchObject({ code: "forbidden" });
    });
  });
  it("anonymous callers cannot read planning facts or profiles", async () => {
    await fixture(async (tx) => {
      await tx`set local role anon`;
      for (const table of ["profiles", "contractor_organisations", "maintenance_requests"]) {
        await expect(tx.savepoint(async probe => { await probe`select * from ${probe(table)}`; })).rejects.toMatchObject({ code: "42501" });
      }
    });
  });
  it("shared quota permits 12 calls, denies the next, refills and isolates identities", async () => {
    await fixture(async (tx, ids) => {
      await withAuthenticatedTransaction(identity(ids.planner), async db => {
        for (let i = 0; i < 12; i++) expect((await db`select * from railplan_private.consume_assistant_token()`)[0].allowed).toBe(true);
        const [denied] = await db`select * from railplan_private.consume_assistant_token()`;
        expect(denied.allowed).toBe(false);
        expect(denied.retry_after_seconds).toBeGreaterThan(0);
        await expect(db.savepoint(async probe => { await probe`update railplan_private.assistant_buckets set tokens = 12`; })).rejects.toMatchObject({ code: "42501" });
        await expect(db.savepoint(async probe => { await probe`select * from railplan_private.migrations`; })).rejects.toMatchObject({ code: "42501" });
      }, tx);
      await tx`reset role`;
      await tx`insert into public.profiles(id,role) values (${ids.unassigned}, 'planner')`;
      await withAuthenticatedTransaction(identity(ids.unassigned), async db => {
        const [separate] = await db`select * from railplan_private.consume_assistant_token()`;
        expect(separate.allowed).toBe(true);
        expect(separate.remaining).toBe(11);
      }, tx);
      await tx`reset role`;
      await tx`update railplan_private.assistant_buckets set updated_at = now() - interval '1 minute' where user_id = ${ids.planner}`;
      await withAuthenticatedTransaction(identity(ids.planner), async db => {
        expect((await db`select * from railplan_private.consume_assistant_token()`)[0].allowed).toBe(true);
      }, tx);
    });
  });
  it("pooled connections do not retain the authenticated role after rollback", async () => {
    const [row] = await sql`select current_user as role`;
    expect(row.role).not.toBe("authenticated");
  });
});
