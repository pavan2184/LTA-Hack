// @vitest-environment node
import { afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { connect } from "@/lib/db/client";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import { REQUEST_FIELD_KEYS } from "@railplan/core/types/ingestions";
import { PLANNING_NIGHT } from "@railplan/core/data/requests";
const sql = connect();
const reachable = await sql`select 1`.then(
  () => true,
  () => false,
);
afterAll(() => sql.end({ timeout: 1 }));
const identity = (id: string) => ({ id }) as VerifiedIdentity;
const rollback = new Error("rollback reviewed proposal fixtures");
const proposal = {
  fields: {
    ...Object.fromEntries(REQUEST_FIELD_KEYS.map((k) => [k, null])),
    title: "Original inspection",
  },
  confidence: {
    ...Object.fromEntries(REQUEST_FIELD_KEYS.map((k) => [k, null])),
    title: 0.8,
  },
  missingFields: REQUEST_FIELD_KEYS.filter((k) => k !== "title"),
  evidence: [
    {
      field: "title",
      quote: "Original inspection",
      start: 10,
      end: 29,
      timestamp: null,
    },
  ],
};
async function fixture(
  work: (
    tx: TransactionSql,
    c: VerifiedIdentity,
    p: VerifiedIdentity,
    other: VerifiedIdentity,
    org: string,
    otherOrg: string,
  ) => Promise<void>,
) {
  await expect(
    sql.begin(async (tx) => {
      const c = randomUUID(),
        p = randomUUID(),
        other = randomUUID(),
        org = randomUUID(),
        otherOrg = randomUUID();
      await tx`insert into auth.users(id) values(${c}),(${p}),(${other})`;
      await tx`insert into contractor_organisations(id,name) values(${org},'Review owner organisation'),(${otherOrg},'Review other organisation')`;
      await tx`insert into profiles(id,role,contractor_organisation_id) values(${c},'contractor',${org}),(${p},'planner',null),(${other},'contractor',${otherOrg})`;
      await work(tx, identity(c), identity(p), identity(other), org, otherOrg);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}
async function save(tx: TransactionSql, actor: VerifiedIdentity) {
  return withAuthenticatedTransaction(
    actor,
    async (db) =>
      (
        await db`select railplan_private.save_private_drafts(${db.json([proposal])}) as ids`
      )[0].ids[0] as string,
    tx,
  );
}
async function mutate(
  tx: TransactionSql,
  actor: VerifiedIdentity,
  id: string,
  version: number,
  action: string,
  fields: unknown = null,
  org: string | null = null,
) {
  return withAuthenticatedTransaction(
    actor,
    async (db) =>
      (
        await db`select railplan_private.review_private_draft(${id}::uuid,${version}::integer,${action},${db.json(fields as never)},${"Reviewed intentionally"},${org}::uuid) as result`
      )[0].result,
    tx,
  );
}
describe.skipIf(!reachable)(
  "private proposal review and explicit sharing",
  { timeout: 20000 },
  () => {
    it("installs explicit source sharing separate from owner-private revisions", async () => {
      expect(
        (
          await sql`select to_regclass('railplan_private.request_proposal_sources') as name`
        )[0].name,
      ).toBe("railplan_private.request_proposal_sources");
    });
    it("allows only owner edits, clears changed support, preserves nulls/original immutable evidence and detects lost updates", async () =>
      fixture(async (tx, c, p, other) => {
        const id = await save(tx, c);
        expect(
          (await mutate(tx, other, id, 1, "edit", proposal.fields)).code,
        ).toBe("not_found");
        expect((await mutate(tx, p, id, 1, "edit", proposal.fields)).code).toBe(
          "not_found",
        );
        const edited = {
          ...proposal.fields,
          title: "Manually corrected",
          description: "  ",
        };
        expect((await mutate(tx, c, id, 1, "edit", edited)).version).toBe(2);
        expect((await mutate(tx, c, id, 1, "edit", edited)).code).toBe(
          "conflict",
        );
        const rows = await withAuthenticatedTransaction(
          c,
          (db) =>
            db`select * from railplan_private.private_draft_revisions where draft_id=${id} order by version`,
          tx,
        );
        expect(rows[1]).toMatchObject({
          fields: {
            title: "Manually corrected",
            description: null,
            durationMinutes: null,
          },
          confidence: { title: null },
          evidence: [],
          manual_fields: ["title"],
          action: "edit",
          actor_id: c.id,
          from_status: "private",
          status: "private",
        });
        expect(rows[1].missing_fields).toContain("description");
        expect(rows[0].evidence).toEqual(proposal.evidence);
        expect(
          (await mutate(tx, c, id, 2, "submit")).fieldErrors,
        ).toHaveProperty("planningNight");
      }));
    it("submits exactly once with deliberate evidence history sharing and exact organisation scope", async () =>
      fixture(async (tx, c, p, other, org) => {
        const id = await save(tx, c);
        const catalogue = await withAuthenticatedTransaction(
          c,
          async (db) =>
            (await db`select railplan_private.request_catalogue() as c`)[0].c,
          tx,
        );
        const complete = {
          planningNight: PLANNING_NIGHT,
          title: "Manual inspection",
          description: "Inspect walkway",
          workClass: "civil",
          blockIds: ["NS10-NS11"],
          durationMinutes: 15,
          preferredStart: 0,
          earliestStart: 0,
          latestEnd: 240,
          equipment: [],
          workforce: [{ roleId: catalogue.roles[0].id, count: 1 }],
        };
        await mutate(tx, c, id, 1, "edit", complete);
        expect((await mutate(tx, c, id, 2, "submit", null, org)).code).toBe(
          "forbidden",
        );
        const submitted = await mutate(tx, c, id, 2, "submit");
        expect(submitted.version).toBe(3);
        expect(submitted.requestId).toBeTruthy();
        expect((await mutate(tx, c, id, 2, "submit")).code).toBe("conflict");
        expect((await mutate(tx, c, id, 3, "submit")).code).toBe(
          "invalid_transition",
        );
        const [source] = await withAuthenticatedTransaction(
          p,
          (db) =>
            db`select * from railplan_private.request_proposal_sources where submission_id=${submitted.requestId}`,
          tx,
        );
        expect(source.source).toMatchObject({
          draftId: id,
          submittedRevision: 3,
          submittedBy: c.id,
          fields: complete,
          evidence: [],
          model: "claude-sonnet-5",
          extractorVersion: "transcript-v1",
        });
        expect(source.source.revisions[0]).toMatchObject({
          action: "extract",
          actorId: c.id,
          evidence: proposal.evidence,
        });
        expect(source.source.revisions[2]).toMatchObject({
          action: "submit",
          status: "submitted",
          reason: "Reviewed intentionally",
        });
        expect(JSON.stringify(source)).not.toContain("transcriptText");
        expect(
          await withAuthenticatedTransaction(
            other,
            (db) =>
              db`select * from railplan_private.request_proposal_sources where submission_id=${submitted.requestId}`,
            tx,
          ),
        ).toEqual([]);
        expect(
          await withAuthenticatedTransaction(
            p,
            (db) =>
              db`select * from railplan_private.private_drafts where id=${id}`,
            tx,
          ),
        ).toEqual([]);
        const requests = await withAuthenticatedTransaction(
          c,
          (db) =>
            db`select s.organisation_id,r.status from railplan_private.request_submissions s join railplan_private.request_revisions r on r.submission_id=s.id where s.id=${submitted.requestId}`,
          tx,
        );
        expect(requests).toEqual([
          { organisation_id: org, status: "submitted" },
        ]);
        await expect(
          tx.savepoint(
            (sp) =>
              sp`update railplan_private.request_proposal_sources set source='{}' where submission_id=${submitted.requestId}`,
          ),
        ).rejects.toMatchObject({ code: "42501" });
      }));
    it("requires planner organisation selection and denies silent cross-organisation resubmission after profile reassignment", async () =>
      fixture(async (tx, c, p, _other, org, otherOrg) => {
        const contractorDraft = await save(tx, c);
        await tx`reset role`;
        await tx`update profiles set contractor_organisation_id=${otherOrg} where id=${c.id}`;
        expect((await mutate(tx, c, contractorDraft, 1, "submit")).code).toBe(
          "forbidden",
        );
        const plannerDraft = await save(tx, p);
        expect(
          (await mutate(tx, p, plannerDraft, 1, "submit")).fieldErrors,
        ).toHaveProperty("organisationId");
        expect(
          (await mutate(tx, p, plannerDraft, 1, "submit", null, randomUUID()))
            .fieldErrors,
        ).toHaveProperty("organisationId");
        const catalogue = await withAuthenticatedTransaction(
          p,
          async (db) =>
            (await db`select railplan_private.request_catalogue() as c`)[0].c,
          tx,
        );
        expect(
          catalogue.organisations.some((o: { id: string }) => o.id === org),
        ).toBe(true);
      }));
  },
);
