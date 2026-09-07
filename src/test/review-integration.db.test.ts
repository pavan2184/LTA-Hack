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
  savePrivateDrafts,
  updatePrivateDraft,
  submitPrivateDraft,
} from "@/lib/ingestions/service";
import {
  actOnRequest,
  createRequest,
  getRequest,
} from "@/lib/requests/service";
import { createPlan, publishPlan } from "@/lib/plans/service";
import { loadPlanningInstance } from "@/lib/db/instance";
import {
  REQUEST_FIELD_KEYS,
  type DraftProposal,
} from "@railplan/core/types/ingestions";
import { PLANNING_NIGHT } from "@railplan/core/data/requests";
import type { RequestFields } from "@railplan/core/types/requests";
const sql = connect();
const reachable = await sql`select 1`.then(
  () => true,
  () => false,
);
afterAll(() => sql.end({ timeout: 1 }));
const identity = (id: string) => ({ id }) as VerifiedIdentity;
const rollback = new Error("rollback review integration fixtures");
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
      await tx`insert into public.contractor_organisations(id,name) values(${org},'Review integration fixture')`;
      await tx`insert into public.profiles(id,role,contractor_organisation_id) values(${planner},'planner',null),(${contractor},'contractor',${org})`;
      await work(tx, identity(planner), identity(contractor));
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}
const fields: RequestFields = {
  planningNight: PLANNING_NIGHT,
  title: "Human-confirmed walkway inspection",
  description: "Fabricated integration work",
  workClass: "civil",
  blockIds: ["NS10-NS11"],
  durationMinutes: 15,
  preferredStart: 0,
  earliestStart: 0,
  latestEnd: 240,
  equipment: [],
  workforce: [{ roleId: "technician", count: 1 }],
};
const planInput = {
  planningNight: PLANNING_NIGHT,
  strategy: "balanced" as const,
  locked: [],
};
const approval = {
  teamId: "T-TRK",
  priority: "low" as const,
  clearanceMinutes: 0,
  requiredSkills: [],
  dependencies: [],
  dependencyLagMinutes: 0,
  safetyConfirmed: true as const,
};
const proposal = {
  fields: {
    ...Object.fromEntries(REQUEST_FIELD_KEYS.map((k) => [k, null])),
    title: "Original extracted inspection",
  },
  confidence: {
    ...Object.fromEntries(REQUEST_FIELD_KEYS.map((k) => [k, null])),
    title: 0.8,
  },
  missingFields: REQUEST_FIELD_KEYS.filter((k) => k !== "title"),
  evidence: [
    {
      field: "title",
      quote: "Original extracted inspection",
      start: 10,
      end: 39,
      timestamp: null,
    },
  ],
} as DraftProposal;
describe.skipIf(!reachable)(
  "human review to canonical planning boundary (rollback)",
  { timeout: 30000 },
  () => {
    it("keeps private edits and submitted evidence inert until approval adds one exact immutable engine revision", () =>
      fixture(async (tx, p, c) => {
        const original = await createPlan(p, planInput, tx);
        const [privateDraft] = await savePrivateDrafts(c, [proposal], tx);
        const edited = await updatePrivateDraft(
          c,
          privateDraft.id,
          {
            expectedVersion: privateDraft.version,
            fields,
            reason: "Confirmed missing details manually",
          },
          tx,
        );
        expect(edited.manualFields).toContain("title");
        expect(edited.confidence.title).toBeNull();
        expect(edited.evidence.some((e) => e.field === "title")).toBe(false);
        const submitted = await submitPrivateDraft(
          c,
          edited.id,
          {
            expectedVersion: edited.version,
            reason: "Share this proposal and its saved evidence for review",
          },
          tx,
        );
        expect(submitted.request.status).toBe("submitted");
        const engineId = `R-${submitted.request.id}`;
        const before = await withAuthenticatedTransaction(
          p,
          (db) => loadPlanningInstance(db, PLANNING_NIGHT),
          tx,
        );
        expect(before.requests.some((r) => r.id === engineId)).toBe(false);
        const unchanged = await createPlan(p, planInput, tx);
        expect(unchanged.sourceRevision).toBe(original.sourceRevision);
        expect(unchanged.inputDigest).toBe(original.inputDigest);
        const reviewed = await actOnRequest(
          p,
          submitted.request.id,
          {
            expectedVersion: submitted.request.version,
            action: "approve",
            reason:
              "Validated complete fields and configured safety assumptions",
            approval,
          },
          tx,
        );
        const approved = await withAuthenticatedTransaction(
          p,
          (db) => loadPlanningInstance(db, PLANNING_NIGHT),
          tx,
        );
        expect(approved.requests.filter((r) => r.id === engineId)).toHaveLength(
          1,
        );
        expect(approved.requests.find((r) => r.id === engineId)).toMatchObject({
          title: fields.title,
          submissionRevision: reviewed.version,
        });
        await expect(publishPlan(p, original.id, tx)).rejects.toMatchObject({
          code: "stale_plan",
        });
        const current = await createPlan(p, planInput, tx);
        expect(BigInt(current.sourceRevision)).toBeGreaterThan(
          BigInt(original.sourceRevision),
        );
        const detail = await getRequest(c, reviewed.id, tx);
        expect(detail.proposalSource).toMatchObject({
          draftId: privateDraft.id,
          submittedRevision: submitted.draft.version,
          fields: { title: fields.title },
        });
        expect(detail.proposalSource?.revisions[0].fields.title).toBe(
          "Original extracted inspection",
        );
        expect(detail.proposalSource?.revisions[0].evidence[0].quote).toBe(
          "Original extracted inspection",
        );
        await actOnRequest(
          c,
          reviewed.id,
          {
            expectedVersion: reviewed.version,
            action: "cancel",
            reason: "Withdraw fabricated test work",
          },
          tx,
        );
        await expect(publishPlan(p, current.id, tx)).rejects.toMatchObject({
          code: "stale_plan",
        });
        const cancelled = await getRequest(c, reviewed.id, tx);
        expect(cancelled.proposalSource).toEqual(detail.proposalSource);
        expect(
          cancelled.revisions.find((r) => r.version === reviewed.version)
            ?.fields,
        ).toEqual(fields);
      }));
    it("invalidates saved plans on rejected-request reversal and cancellation even before approval", () =>
      fixture(async (tx, p, c) => {
        const draft = await createRequest(c, { fields }, tx);
        const submitted = await actOnRequest(
          c,
          draft.id,
          { expectedVersion: draft.version, action: "submit", reason: "" },
          tx,
        );
        const rejected = await actOnRequest(
          p,
          draft.id,
          {
            expectedVersion: submitted.version,
            action: "reject",
            reason: "Fixture requires reconsideration",
          },
          tx,
        );
        const beforeReverse = await createPlan(p, planInput, tx);
        const reversed = await actOnRequest(
          c,
          draft.id,
          {
            expectedVersion: rejected.version,
            action: "revise",
            reason: "Reconsider the rejected proposal",
          },
          tx,
        );
        await expect(
          publishPlan(p, beforeReverse.id, tx),
        ).rejects.toMatchObject({ code: "stale_plan" });
        const beforeCancel = await createPlan(p, planInput, tx);
        await actOnRequest(
          c,
          draft.id,
          {
            expectedVersion: reversed.version,
            action: "cancel",
            reason: "Cancel the unapproved revision",
          },
          tx,
        );
        await expect(publishPlan(p, beforeCancel.id, tx)).rejects.toMatchObject(
          { code: "stale_plan" },
        );
      }));
  },
);
