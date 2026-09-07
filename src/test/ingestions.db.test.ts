// @vitest-environment node
import { afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { connect } from "@/lib/db/client";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import { EXTRACTION_MODEL } from "@/lib/ingestions/model";
import { EXTRACTOR_VERSION } from "@/lib/ingestions/guard";
import { REQUEST_FIELD_KEYS } from "@railplan/core/types/ingestions";
const sql = connect();
const reachable = await sql`select 1`.then(
  () => true,
  () => false,
);
afterAll(() => sql.end({ timeout: 1 }));
const rollback = new Error("rollback ingestion fixtures");
const identity = (id: string) => ({ id }) as VerifiedIdentity;
const proposal = {
  fields: {
    ...Object.fromEntries(REQUEST_FIELD_KEYS.map((k) => [k, null])),
    title: "Walkway inspection",
  },
  confidence: {
    ...Object.fromEntries(REQUEST_FIELD_KEYS.map((k) => [k, null])),
    title: 0.8,
  },
  missingFields: REQUEST_FIELD_KEYS.filter((k) => k !== "title"),
  evidence: [
    {
      field: "title",
      quote: "Walkway inspection",
      start: 10,
      end: 28,
      timestamp: null,
    },
  ],
};
describe.skipIf(!reachable)(
  "private transcript drafts under authenticated SQL",
  { timeout: 20000 },
  () => {
    it("installs private owner-scoped draft storage", async () => {
      expect(
        (
          await sql`select to_regclass('railplan_private.private_drafts') as name`
        )[0].name,
      ).toBe("railplan_private.private_drafts");
    });
    it("saves only owner-derived proposals, denies other owners including planners, preserves immutable excerpts and never advances planning inputs", async () => {
      await expect(
        sql.begin(async (tx) => {
          const owner = randomUUID(),
            other = randomUUID(),
            planner = randomUUID(),
            org = randomUUID();
          await tx`insert into auth.users(id) values(${owner}),(${other}),(${planner})`;
          await tx`insert into contractor_organisations(id,name) values(${org},'Private draft fixture')`;
          await tx`insert into profiles(id,role,contractor_organisation_id) values(${owner},'contractor',${org}),(${other},'contractor',${org}),(${planner},'planner',null)`;
          const before = (
            await tx`select revision::text from railplan_private.planning_source`
          )[0].revision;
          const ids = await withAuthenticatedTransaction(
            identity(owner),
            async (db) => {
              const [row] =
                await db`select railplan_private.save_private_drafts(${db.json([proposal])}) as ids`;
              return row.ids as string[];
            },
            tx,
          );
          expect(ids).toHaveLength(1);
          for (const actor of [other, planner])
            expect(
              await withAuthenticatedTransaction(
                identity(actor),
                (db) =>
                  db`select * from railplan_private.private_drafts where id=${ids[0]}`,
                tx,
              ),
            ).toEqual([]);
          const saved = await withAuthenticatedTransaction(
            identity(owner),
            (db) =>
              db`select d.owner_id,d.organisation_id,r.* from railplan_private.private_drafts d join railplan_private.private_draft_revisions r on r.draft_id=d.id where d.id=${ids[0]}`,
            tx,
          );
          expect(saved[0]).toMatchObject({
            owner_id: owner,
            organisation_id: org,
            fields: proposal.fields,
            evidence: proposal.evidence,
            version: 1,
            model: EXTRACTION_MODEL,
            extractor_version: EXTRACTOR_VERSION,
          });
          expect(saved[0]).not.toHaveProperty("transcript");
          await expect(
            tx.savepoint(
              (sp) =>
                sp`update railplan_private.private_draft_revisions set confidence='{}' where draft_id=${ids[0]}`,
            ),
          ).rejects.toMatchObject({ code: "42501" });
          await expect(
            tx.savepoint(
              (sp) =>
                sp`select railplan_private.save_private_drafts(${sp.json([{ ...proposal, transcript: "DISCARDED FULL TEXT" }])})`,
            ),
          ).rejects.toMatchObject({ code: "22023" });
          await expect(
            tx.savepoint(
              (sp) =>
                sp`select railplan_private.save_private_drafts(${sp.json([{ ...proposal, evidence: [...proposal.evidence, { field: null, quote: "Extra", start: 30, end: 35, timestamp: null }] }])})`,
            ),
          ).rejects.toMatchObject({ code: "22023" });
          await tx`reset role`;
          expect(
            (
              await tx`select revision::text from railplan_private.planning_source`
            )[0].revision,
          ).toBe(before);
          const columns =
            await tx`select column_name from information_schema.columns where table_schema='railplan_private' and table_name in ('private_drafts','private_draft_revisions')`;
          expect(columns.map((r) => r.column_name)).not.toContain("transcript");
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    });
    it("bounds extraction quota for each assigned owner without sharing buckets across an organisation", async () => {
      await expect(
        sql.begin(async (tx) => {
          const user = randomUUID(),
            planner = randomUUID(),
            org = randomUUID();
          await tx`insert into auth.users(id) values(${user}),(${planner})`;
          await tx`insert into contractor_organisations(id,name) values(${org},'Ingestion quota fixture')`;
          await tx`insert into profiles(id,role,contractor_organisation_id) values(${user},'contractor',${org}),(${planner},'planner',null)`;
          await withAuthenticatedTransaction(
            identity(user),
            async (db) => {
              for (let i = 0; i < 3; i++)
                expect(
                  (
                    await db`select * from railplan_private.consume_ingestion_token()`
                  )[0].allowed,
                ).toBe(true);
              expect(
                (
                  await db`select * from railplan_private.consume_ingestion_token()`
                )[0],
              ).toMatchObject({ allowed: false });
            },
            tx,
          );
          expect(
            await withAuthenticatedTransaction(
              identity(planner),
              async (db) =>
                (
                  await db`select * from railplan_private.consume_ingestion_token()`
                )[0].allowed,
              tx,
            ),
          ).toBe(true);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    });
  },
);
