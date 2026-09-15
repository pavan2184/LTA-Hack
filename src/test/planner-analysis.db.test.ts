// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { connect } from "@/lib/db/client";
import type { VerifiedIdentity } from "@/lib/auth/session";
import { createPlan, publishPlan } from "@/lib/plans/service";
import { analysePlan } from "@/lib/plans/analysis";
import { getPlannerOverview } from "@/lib/plans/overview";
import { PLANNING_NIGHT } from "@railplan/core/data/requests";
const sql = connect();
const reachable = await sql`select 1`.then(
  () => true,
  () => false,
);
afterAll(() => sql.end({ timeout: 1 }));
if (!reachable)
  console.warn(
    "Planner analysis DB tests skipped: database unavailable; required DB verification remains outstanding.",
  );
const rollback = new Error("rollback connected planner fixtures");
const parameters = {
  planningNight: PLANNING_NIGHT,
  strategy: "balanced" as const,
  locked: [],
};
async function fixture(
  work: (
    tx: TransactionSql,
    planner: VerifiedIdentity,
    contractor: VerifiedIdentity,
    org: string,
  ) => Promise<void>,
) {
  await expect(
    sql.begin("isolation level repeatable read", async (tx) => {
      const planner = randomUUID(),
        contractor = randomUUID(),
        org = randomUUID();
      await tx`insert into auth.users(id) values(${planner}),(${contractor})`;
      await tx`insert into public.contractor_organisations(id,name) values(${org},'Connected planner rollback fixture')`;
      await tx`insert into public.profiles(id,role,contractor_organisation_id) values(${planner},'planner',null),(${contractor},'contractor',${org})`;
      await work(
        tx,
        { id: planner } as VerifiedIdentity,
        { id: contractor } as VerifiedIdentity,
        org,
      );
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}
describe.skipIf(!reachable)(
  "connected planner read-only RLS and guarded saves",
  () => {
    it("reads exact saved inspection, independently re-solves pins and five objectives without source writes", async () => {
      await fixture(async (tx, planner, contractor) => {
        const plan = await createPlan(planner, parameters, tx);
        await tx`reset role`;
        const before =
          await tx`select revision,lock_generation from railplan_private.planning_source`;
        const conflicts = await analysePlan(planner, plan.id, { operation: "conflicts", strategy: "balanced" }, tx);
        if (conflicts.operation !== "conflicts") throw new Error("wrong operation");
        expect(conflicts.groups.length).toBeGreaterThan(0);
        let repaired = false;
        for (const group of conflicts.groups) {
          try {
            const proposal = await analysePlan(planner, plan.id, {
              operation: "repair", strategy: "balanced", violationId: group.primary.id,
            }, tx);
            if (proposal.operation !== "preview") throw new Error("wrong operation");
            expect(proposal.result.independentlyValidated).toBe(true);
            expect(proposal.basis.planId).toBe(plan.id);
            expect(proposal.parameters.locked.length).toBeGreaterThan(0);
            repaired = true; break;
          } catch (error) { expect(error).toMatchObject({ code: "invalid_request" }); }
        }
        expect(repaired).toBe(true);
        for (const operation of ["conflicts", "repair"] as const) {
          await expect(analysePlan(contractor, plan.id, operation === "conflicts"
            ? { operation, strategy: "balanced" }
            : { operation, strategy: "balanced", violationId: conflicts.groups[0].primary.id }, tx))
            .rejects.toMatchObject({ code: "forbidden" });
        }
        const inspection = await analysePlan(
          planner,
          plan.id,
          { operation: "inspect", requestId: plan.placements[0].requestId },
          tx,
        );
        if (inspection.operation !== "inspect")
          throw new Error("wrong operation");
        expect(inspection.result.plan.placements).toEqual(plan.placements);
        expect(inspection.explanation.placedStart).toBe(
          plan.placements[0].startMinute,
        );
        const locked = [{ ...plan.placements[0], locked: true }];
        const comparisons = await analysePlan(
          planner,
          plan.id,
          { operation: "compare-objectives", locked },
          tx,
        );
        if (comparisons.operation !== "compare-objectives")
          throw new Error("wrong operation");
        expect(comparisons.comparisons).toHaveLength(5);
        for (const preview of comparisons.comparisons) {
          expect(preview.result.plan.placements).toContainEqual(locked[0]);
          expect(preview.parameters.locked).toEqual(locked);
          expect(preview.basis.sourceRevision).toBe(plan.sourceRevision);
        }
        await getPlannerOverview(
          planner,
          { planningNight: PLANNING_NIGHT },
          tx,
        );
        await expect(
          analysePlan(
            contractor,
            plan.id,
            { operation: "preview", strategy: "balanced" },
            tx,
          ),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          getPlannerOverview(contractor, {}, tx),
        ).rejects.toMatchObject({ code: "forbidden" });
        await tx`reset role`;
        expect(
          await tx`select revision,lock_generation from railplan_private.planning_source`,
        ).toEqual(before);
        await tx`update public.equipment_types set units=units where id='E-THM'`;
        await expect(analysePlan(planner, plan.id, {
          operation: "repair", strategy: "balanced", violationId: conflicts.groups[0].primary.id,
        }, tx)).rejects.toMatchObject({ code: "invalid_request" });
        const stale = await analysePlan(
          planner,
          plan.id,
          { operation: "inspect", requestId: plan.placements[0].requestId },
          tx,
        );
        expect(stale.stale).toBe(true);
        if (stale.operation !== "inspect") throw new Error("wrong operation");
        expect(stale.result).toEqual(inspection.result);
      });
    }, 30000);
    it("rejects altered preview provenance/parameters/night and saves exact reviewed digest without guard fields", async () => {
      await fixture(async (tx, planner) => {
        const plan = await createPlan(planner, parameters, tx);
        const preview = await analysePlan(
          planner,
          plan.id,
          { operation: "preview", strategy: "min-risk" },
          tx,
        );
        if (preview.operation !== "preview") throw new Error("wrong operation");
        await tx`reset role`;
        const [wrongNight] = await tx<
          { id: string }[]
        >`insert into railplan_private.planning_runs(planning_night,source_revision,input_digest,facts,parameters,result,created_by)
        select '2099-01-01'::date,source_revision,input_digest,facts,parameters,result,created_by from railplan_private.planning_runs where id=${plan.id} returning id`;
        await expect(
          createPlan(
            planner,
            {
              ...preview.parameters,
              expectedBasis: { ...preview.basis, planId: wrongNight.id },
            },
            tx,
          ),
        ).rejects.toMatchObject({ code: "stale_plan" });
        for (const change of [
          { sourceRevision: "0" },
          { solverVersion: "old" },
          { constraintVersion: "old" },
          { inputDigest: "sha256:" + "0".repeat(64) },
        ]) {
          await expect(
            createPlan(
              planner,
              {
                ...preview.parameters,
                expectedBasis: { ...preview.basis, ...change },
              },
              tx,
            ),
          ).rejects.toMatchObject({ code: "stale_plan" });
        }
        await expect(
          createPlan(
            planner,
            {
              ...preview.parameters,
              strategy: "balanced",
              expectedBasis: preview.basis,
            },
            tx,
          ),
        ).rejects.toMatchObject({ code: "stale_plan" });
        const saved = await createPlan(
          planner,
          { ...preview.parameters, expectedBasis: preview.basis },
          tx,
        );
        expect(saved.inputDigest).toBe(preview.basis.inputDigest);
        expect(saved.placements).toEqual(preview.result.plan.placements);
        const [row] =
          await tx`select parameters from railplan_private.planning_runs where id=${saved.id}`;
        expect(row.parameters).toEqual({ ...preview.parameters, basedOnPlanId: plan.id });
        await expect(createPlan(planner, {
          ...preview.parameters, basedOnPlanId: saved.id, expectedBasis: preview.basis,
        }, tx)).rejects.toMatchObject({ code: "stale_plan" });
        await tx`update public.equipment_types set units=units where id='E-THM'`;
        await expect(
          createPlan(
            planner,
            { ...preview.parameters, expectedBasis: preview.basis },
            tx,
          ),
        ).rejects.toMatchObject({ code: "stale_plan" });
      });
    }, 30000);
    it("rejects a preview whose base was superseded after review", async () => {
      await fixture(async (tx, planner) => {
        const base = await createPlan(planner, parameters, tx);
        await publishPlan(planner, base.id, tx);
        const preview = await analysePlan(planner, base.id, { operation: "preview", strategy: "balanced" }, tx);
        if (preview.operation !== "preview") throw new Error("wrong operation");
        const replacement = await createPlan(planner, parameters, tx);
        await publishPlan(planner, replacement.id, tx);
        await expect(createPlan(planner, {
          ...preview.parameters, expectedBasis: preview.basis,
        }, tx)).rejects.toMatchObject({ code: "stale_plan" });
      });
    }, 30000);
    it("counts current submitted revisions exactly and finds publication outside cursor pages", async () => {
      await fixture(async (tx, planner, _contractor, org) => {
        const plan = await createPlan(planner, parameters, tx);
        await publishPlan(planner, plan.id, tx);
        const baseline = await getPlannerOverview(
          planner,
          { planningNight: PLANNING_NIGHT },
          tx,
        );
        await tx`reset role`;
        // Owner-only inserts are isolated test fixtures; normal application writes retain narrow functions.
        await tx`insert into railplan_private.planning_runs(id,planning_night,source_revision,input_digest,facts,parameters,result,created_by,created_at)
        select gen_random_uuid(),planning_night,source_revision,input_digest,facts,parameters,result,created_by,created_at+interval '1 second'
        from railplan_private.planning_runs cross join generate_series(1,21) where id=${plan.id}`;
        const current = randomUUID(),
          old = randomUUID(),
          other = randomUUID();
        const bulk = await tx<
          { id: string }[]
        >`insert into railplan_private.request_submissions(organisation_id) select ${org}::uuid from generate_series(1,105) returning id`;
        await tx`insert into railplan_private.request_revisions(submission_id,version,status,fields,action,actor_id,reason)
        select id,1,'submitted',${tx.json({ planningNight: PLANNING_NIGHT })},'submit',${planner.id}::uuid,'' from railplan_private.request_submissions where id in ${tx(bulk.map((r) => r.id))}`;
        await tx`insert into railplan_private.request_submissions(id,organisation_id,current_version) values(${current},${org},1),(${old},${org},2),(${other},${org},1)`;
        await tx`insert into railplan_private.request_revisions(submission_id,version,status,fields,action,actor_id,reason) values
        (${current},1,'submitted',${tx.json({ planningNight: PLANNING_NIGHT })},'submit',${planner.id},''),
        (${old},1,'submitted',${tx.json({ planningNight: PLANNING_NIGHT })},'submit',${planner.id},''),
        (${old},2,'needs_info',${tx.json({ planningNight: PLANNING_NIGHT })},'needs_info',${planner.id},''),
        (${other},1,'submitted',${tx.json({ planningNight: "2099-01-01" })},'submit',${planner.id},'')`;
        const first = await getPlannerOverview(
          planner,
          { planningNight: PLANNING_NIGHT },
          tx,
        );
        const [{ count }] = await tx<
          { count: number }[]
        >`select count(*)::integer as count from railplan_private.request_submissions s join railplan_private.request_revisions r on r.submission_id=s.id and r.version=s.current_version where r.status='submitted' and r.fields->>'planningNight'=${PLANNING_NIGHT}`;
        expect(first.pendingCount).toBe(count);
        expect(count).toBe(baseline.pendingCount + 106);
        expect(first.currentPublication?.id).toBe(plan.id);
        expect(first.versions).toHaveLength(20);
        expect(first.versions.some((p) => p.id === plan.id)).toBe(false);
        expect(first.nextCursor).not.toBeNull();
        const next = await getPlannerOverview(
          planner,
          { planningNight: PLANNING_NIGHT, cursor: first.nextCursor! },
          tx,
        );
        expect(next.versions.some((p) => p.id === plan.id)).toBe(true);
        expect(
          next.versions.every(
            (p) => !first.versions.some((a) => a.id === p.id),
          ),
        ).toBe(true);
        expect(next.currentPublication?.id).toBe(plan.id);
        expect(
          first.versions.every((p) => !("facts" in p) && !("placements" in p)),
        ).toBe(true);
        await expect(
          getPlannerOverview(
            planner,
            {
              cursor: Buffer.from(
                JSON.stringify({
                  planningNight: "2099-01-01",
                  id: plan.id,
                  createdAt: plan.createdAt,
                }),
              ).toString("base64url"),
              planningNight: PLANNING_NIGHT,
            },
            tx,
          ),
        ).rejects.toMatchObject({ code: "invalid_request" });
      });
    }, 30000);
  },
);
