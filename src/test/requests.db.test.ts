// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { connect } from "@/lib/db/client";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import { createPlan, publishPlan } from "@/lib/plans/service";
import {
  getRequest,
  listRequests,
  createRequest,
  actOnRequest,
  updateRequest,
} from "@/lib/requests/service";
import { loadPlanningInstance } from "@/lib/db/instance";
import { PLANNING_NIGHT } from "@railplan/core/data/requests";
const sql = connect();
const reachable = await sql`select 1`.then(
  () => true,
  () => false,
);
afterAll(() => sql.end({ timeout: 1 }));
const identity = (id: string) => ({ id }) as VerifiedIdentity;
const rollback = new Error("rollback request fixtures");
async function fixture(
  work: (
    tx: TransactionSql,
    p: VerifiedIdentity,
    c: VerifiedIdentity,
    other: VerifiedIdentity,
  ) => Promise<void>,
) {
  await expect(
    sql.begin(async (tx) => {
      const p = randomUUID(),
        c = randomUUID(),
        other = randomUUID(),
        org = randomUUID(),
        org2 = randomUUID();
      await tx`insert into auth.users(id) values(${p}),(${c}),(${other})`;
      await tx`insert into contractor_organisations(id,name) values(${org},'Request fixture'),(${org2},'Other request fixture')`;
      await tx`insert into profiles(id,role,contractor_organisation_id) values(${p},'planner',null),(${c},'contractor',${org}),(${other},'contractor',${org2})`;
      await work(tx, identity(p), identity(c), identity(other));
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}
const fields = {
  planningNight: PLANNING_NIGHT,
  title: "Walkway inspection",
  description: "Inspect the walkway",
  workClass: "civil",
  blockIds: ["NS10-NS11"],
  durationMinutes: 15,
  preferredStart: 15,
  earliestStart: 0,
  latestEnd: 240,
  equipment: [],
  workforce: [{ roleId: "maintainer", count: 1 }],
};
const approval = {
  teamId: "T-TRK",
  priority: "low",
  clearanceMinutes: 0,
  requiredSkills: [],
  dependencies: [],
  dependencyLagMinutes: 0,
  safetyConfirmed: true,
};
async function mutate(
  tx: TransactionSql,
  actor: VerifiedIdentity,
  id: string | null,
  version: number | null,
  action: string,
  f: unknown = null,
  a: unknown = null,
  reason = "Fixture decision",
) {
  return withAuthenticatedTransaction(
    actor,
    async (db) => {
      const [row] =
        await db`select railplan_private.mutate_request(${id}::uuid,${version}::integer,${action},${db.json(f as never)},${db.json(a as never)},${reason}) as result`;
      return row.result;
    },
    tx,
  );
}
describe.skipIf(!reachable)(
  "request lifecycle under authenticated SQL (rollback)",
  // These rollback journeys perform many sequential authenticated round trips
  // against the hosted DB (including four full-instance loads). A normal scoped
  // run measured 2.2–6.3s per lifecycle; 5s unit-test defaults can expire before
  // rollback finishes. Keep the I/O budget local; statement_timeout stays 10s.
  { timeout: 20_000 },
  () => {
    it("installs the private immutable intake boundary", async () => {
      expect(
        await sql`select to_regclass('railplan_private.request_submissions') as name`,
      ).toEqual([{ name: "railplan_private.request_submissions" }]);
    });
    it("audits needs-info editing and scopes same-organisation service reads", async () =>
      fixture(async (tx, p, c, other) => {
        const catalog = await withAuthenticatedTransaction(
          c,
          async (db) =>
            (await db`select railplan_private.request_catalogue() as c`)[0].c,
          tx,
        );
        const valid = {
          ...fields,
          workClass: "civil" as const,
          workforce: [{ roleId: catalog.roles[0].id, count: 1 }],
        };
        let saved = await createRequest(c, { fields: valid }, tx);
        saved = await actOnRequest(
          c,
          saved.id,
          { expectedVersion: 1, action: "submit", reason: "" },
          tx,
        );
        saved = await actOnRequest(
          p,
          saved.id,
          { expectedVersion: 2, action: "needs_info", reason: "Clarify scope" },
          tx,
        );
        expect(saved.status).toBe("needs_info");
        saved = await updateRequest(
          c,
          saved.id,
          {
            expectedVersion: 3,
            fields: { ...valid, title: "Clarified inspection" },
          },
          tx,
        );
        saved = await actOnRequest(
          c,
          saved.id,
          { expectedVersion: 4, action: "submit", reason: "" },
          tx,
        );
        saved = await actOnRequest(
          p,
          saved.id,
          { expectedVersion: 5, action: "reject", reason: "Not required" },
          tx,
        );
        expect(saved.history.map((e) => e.action)).toEqual([
          "create",
          "submit",
          "needs_info",
          "edit",
          "submit",
          "reject",
        ]);
        expect(saved.history[2]).toMatchObject({
          actorId: p.id,
          fromStatus: "submitted",
          toStatus: "needs_info",
          reason: "Clarify scope",
        });
        expect(
          (await listRequests(other, tx)).some((r) => r.id === saved.id),
        ).toBe(false);
        await expect(getRequest(other, saved.id, tx)).rejects.toMatchObject({
          code: "not_found",
        });
        expect(
          (await getRequest(c, saved.id, tx)).revisions[0].fields.title,
        ).toBe(valid.title);
      }));
    it("invalidates stale plans and derives scheduling from the exact published revision", async () =>
      fixture(async (tx, p, c) => {
        const original = await createPlan(
          p,
          { planningNight: PLANNING_NIGHT, strategy: "balanced", locked: [] },
          tx,
        );
        const catalog = await withAuthenticatedTransaction(
          c,
          async (db) =>
            (await db`select railplan_private.request_catalogue() as c`)[0].c,
          tx,
        );
        const valid = {
          ...fields,
          workforce: [{ roleId: catalog.roles[0].id, count: 1 }],
        };
        const created = await mutate(tx, c, null, null, "create", valid);
        await mutate(tx, c, created.id, 1, "submit");
        await mutate(tx, p, created.id, 2, "approve", null, {
          ...approval,
          priority: "critical",
        });
        await expect(publishPlan(p, original.id, tx)).rejects.toMatchObject({
          code: "stale_plan",
        });
        const approvedPlan = await createPlan(
          p,
          { planningNight: PLANNING_NIGHT, strategy: "balanced", locked: [] },
          tx,
        );
        expect(BigInt(approvedPlan.sourceRevision)).toBeGreaterThan(
          BigInt(original.sourceRevision),
        );
        expect(
          approvedPlan.placements.some(
            (r) => r.requestId === `R-${created.id}`,
          ),
        ).toBe(true);
        await publishPlan(p, approvedPlan.id, tx);
        expect((await getRequest(c, created.id, tx)).scheduled).toMatchObject({
          planId: approvedPlan.id,
          revision: 3,
        });
        await mutate(tx, c, created.id, 3, "revise");
        expect((await getRequest(c, created.id, tx)).scheduled).toMatchObject({
          planId: approvedPlan.id,
          revision: 3,
        });
        const beforeCancel = await createPlan(
          p,
          { planningNight: PLANNING_NIGHT, strategy: "balanced", locked: [] },
          tx,
        );
        await mutate(tx, c, created.id, 4, "cancel");
        await expect(publishPlan(p, beforeCancel.id, tx)).rejects.toMatchObject(
          { code: "stale_plan" },
        );
        expect((await getRequest(c, created.id, tx)).scheduled).toMatchObject({
          planId: approvedPlan.id,
          revision: 3,
        });
        const refreshed = await createPlan(
          p,
          { planningNight: PLANNING_NIGHT, strategy: "balanced", locked: [] },
          tx,
        );
        await publishPlan(p, refreshed.id, tx);
        expect((await getRequest(c, created.id, tx)).scheduled).toBeNull();
      }));
    it("protects baseline predecessors from planner deletion and cross-night moves", async () =>
      fixture(async (tx, p, c) => {
        const catalog = await withAuthenticatedTransaction(
          c,
          async (db) =>
            (await db`select railplan_private.request_catalogue() as c`)[0].c,
          tx,
        );
        const valid = {
          ...fields,
          workforce: [{ roleId: catalog.roles[0].id, count: 1 }],
        };
        const request = await mutate(tx, c, null, null, "create", valid);
        await mutate(tx, c, request.id, 1, "submit");
        expect(
          (
            await mutate(tx, p, request.id, 2, "approve", null, {
              ...approval,
              dependencies: ["M-001"],
            })
          ).version,
        ).toBe(3);
        await withAuthenticatedTransaction(
          p,
          async (db) => {
            await expect(
              db.savepoint(
                (sp) =>
                  sp`delete from public.maintenance_requests where id='M-001'`,
              ),
            ).rejects.toMatchObject({ code: "23503" });
            await expect(
              db.savepoint(
                (sp) =>
                  sp`update public.maintenance_requests set planning_night='2026-08-04' where id='M-001'`,
              ),
            ).rejects.toMatchObject({ code: "23503" });
          },
          tx,
        );
      }));
    it("blocks removing or moving active prerequisites and rejects dependency cycles", async () =>
      fixture(async (tx, p, c) => {
        const catalog = await withAuthenticatedTransaction(
          c,
          async (db) =>
            (await db`select railplan_private.request_catalogue() as c`)[0].c,
          tx,
        );
        const valid = {
          ...fields,
          workforce: [{ roleId: catalog.roles[0].id, count: 1 }],
        };
        const first = await mutate(tx, c, null, null, "create", valid);
        await mutate(tx, c, first.id, 1, "submit");
        await mutate(tx, p, first.id, 2, "approve", null, approval);
        const second = await mutate(tx, c, null, null, "create", valid);
        await mutate(tx, c, second.id, 1, "submit");
        await mutate(tx, p, second.id, 2, "approve", null, {
          ...approval,
          dependencies: [`R-${first.id}`],
        });
        expect(
          (await mutate(tx, c, first.id, 3, "cancel")).fieldErrors,
        ).toHaveProperty("dependencies");
        await mutate(tx, c, first.id, 3, "revise");
        await mutate(tx, c, first.id, 4, "submit");
        expect(
          (
            await mutate(tx, p, first.id, 5, "approve", null, {
              ...approval,
              dependencies: [`R-${second.id}`],
            })
          ).fieldErrors,
        ).toHaveProperty("approval.dependencies");
        expect(
          (await mutate(tx, p, first.id, 5, "approve", null, approval)).version,
        ).toBe(6);
        await withAuthenticatedTransaction(
          p,
          (db) =>
            db`insert into public.planning_nights(planning_night,window_start_minute,window_end_minute,slot_minutes,minutes_per_block_hop,inter_line_transfer_minutes) select '2026-08-04'::date,window_start_minute,window_end_minute,slot_minutes,minutes_per_block_hop,inter_line_transfer_minutes from public.planning_nights where planning_night=${PLANNING_NIGHT} on conflict do nothing`,
          tx,
        );
        await mutate(tx, c, first.id, 6, "revise");
        await mutate(tx, c, first.id, 7, "edit", {
          ...valid,
          planningNight: "2026-08-04",
        });
        await mutate(tx, c, first.id, 8, "submit");
        expect(
          (await mutate(tx, p, first.id, 9, "approve", null, approval))
            .fieldErrors,
        ).toHaveProperty("dependencies");
        await mutate(tx, c, second.id, 3, "cancel");
        expect((await mutate(tx, c, first.id, 9, "cancel")).version).toBe(10);
      }));
    it("scopes catalogue and rows, validates direct writes and captures immutable active approval", async () =>
      fixture(async (tx, p, c, other) => {
        const catalog = await withAuthenticatedTransaction(
          c,
          async (db) =>
            (await db`select railplan_private.request_catalogue() as c`)[0].c,
          tx,
        );
        expect(catalog.teams).toBeUndefined();
        expect(catalog.dependencies).toBeUndefined();
        expect(catalog.nights.length).toBeGreaterThan(0);
        const valid = {
          ...fields,
          workforce: [{ roleId: catalog.roles[0].id, count: 1 }],
        };
        expect(
          (
            await mutate(tx, c, null, null, "create", {
              ...valid,
              blockIds: ["missing"],
            })
          ).fieldErrors,
        ).toHaveProperty("blockIds");
        expect(
          (
            await mutate(tx, c, null, null, "create", {
              ...valid,
              status: "approved",
            })
          ).code,
        ).toBe("invalid_request");
        const created = await mutate(tx, c, null, null, "create", valid);
        expect(created.id).toBeTruthy();
        expect((await mutate(tx, other, created.id, 1, "cancel")).code).toBe(
          "not_found",
        );
        expect(
          await withAuthenticatedTransaction(
            other,
            (db) =>
              db`select * from railplan_private.request_submissions where id=${created.id}`,
            tx,
          ),
        ).toEqual([]);
        expect(
          (await mutate(tx, c, created.id, 1, "approve", null, approval)).code,
        ).toBe("forbidden");
        expect((await mutate(tx, c, created.id, 1, "submit")).version).toBe(2);
        expect((await mutate(tx, c, created.id, 1, "cancel")).code).toBe(
          "conflict",
        );
        const before = await withAuthenticatedTransaction(
          p,
          (db) => loadPlanningInstance(db, PLANNING_NIGHT),
          tx,
        );
        expect(before.requests.some((r) => r.id === `R-${created.id}`)).toBe(
          false,
        );
        expect(
          (
            await mutate(tx, p, created.id, 2, "approve", null, {
              ...approval,
              safetyConfirmed: false,
            })
          ).fieldErrors,
        ).toHaveProperty("approval.safetyConfirmed");
        const approved = await mutate(
          tx,
          p,
          created.id,
          2,
          "approve",
          null,
          approval,
        );
        expect(approved.version).toBe(3);
        const after = await withAuthenticatedTransaction(
          p,
          (db) => loadPlanningInstance(db, PLANNING_NIGHT),
          tx,
        );
        expect(
          after.requests.filter((r) => r.id === `R-${created.id}`),
        ).toHaveLength(1);
        expect(
          after.requests.find((r) => r.id === `R-${created.id}`),
        ).toMatchObject({ submissionRevision: 3 });
        expect((await mutate(tx, c, created.id, 3, "edit", valid)).code).toBe(
          "invalid_transition",
        );
        expect((await mutate(tx, c, created.id, 3, "revise")).version).toBe(4);
        expect(
          (
            await withAuthenticatedTransaction(
              p,
              (db) => loadPlanningInstance(db, PLANNING_NIGHT),
              tx,
            )
          ).requests.find((r) => r.id === `R-${created.id}`),
        ).toMatchObject({ submissionRevision: 3 });
        expect((await mutate(tx, c, created.id, 4, "cancel")).version).toBe(5);
        expect(
          (
            await withAuthenticatedTransaction(
              p,
              (db) => loadPlanningInstance(db, PLANNING_NIGHT),
              tx,
            )
          ).requests.some((r) => r.id === `R-${created.id}`),
        ).toBe(false);
        const rows = await withAuthenticatedTransaction(
          c,
          (db) =>
            db`select * from railplan_private.request_revisions where submission_id=${created.id} order by version`,
          tx,
        );
        expect(rows).toHaveLength(5);
        expect(rows[2].status).toBe("approved");
        await expect(
          tx.savepoint(
            (sp) =>
              sp`update railplan_private.request_revisions set reason='tampered' where submission_id=${created.id}`,
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await tx`reset role`;
        await expect(
          tx.savepoint(
            (sp) =>
              sp`update railplan_private.request_revisions set reason='owner tampered' where submission_id=${created.id}`,
          ),
        ).rejects.toMatchObject({ code: "42501" });
      }));
  },
);
