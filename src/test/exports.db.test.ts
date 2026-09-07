// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { connect } from "@/lib/db/client";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import { createPlan, publishPlan, getPlan } from "@/lib/plans/service";
import { getPlanExport } from "@/lib/exports/service";
import { serializePlanExport } from "@/lib/exports/serialize";
import { PLANNING_NIGHT } from "@railplan/core/data/requests";
const sql = connect();
const reachable = await sql`select 1`.then(
  () => true,
  () => false,
);
afterAll(() => sql.end({ timeout: 1 }));
const identity = (id: string) => ({ id }) as VerifiedIdentity,
  rollback = new Error("rollback export fixtures");
const input = {
  planningNight: PLANNING_NIGHT,
  strategy: "balanced" as const,
  locked: [],
};
async function fixture(
  work: (
    tx: TransactionSql,
    p: VerifiedIdentity,
    c: VerifiedIdentity,
  ) => Promise<void>,
) {
  await expect(
    sql.begin(async (tx) => {
      const p = randomUUID(),
        c = randomUUID(),
        org = randomUUID();
      await tx`insert into auth.users(id) values(${p}),(${c})`;
      await tx`insert into public.contractor_organisations(id,name) values(${org},'Export fixture')`;
      await tx`insert into public.profiles(id,role,contractor_organisation_id) values(${p},'planner',null),(${c},'contractor',${org})`;
      await work(tx, identity(p), identity(c));
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}
describe.skipIf(!reachable)(
  "saved plan exports (rollback)",
  { timeout: 20000 },
  () => {
    it("reads exact saved placements/facts/metrics/provenance repeatedly without mutating source state", () =>
      fixture(async (tx, p) => {
        const plan = await createPlan(p, input, tx);
        await tx`reset role`;
        const [before] =
          await tx`select revision,lock_generation from railplan_private.planning_source`;
        const first = await getPlanExport(p, plan.id, tx),
          second = await getPlanExport(p, plan.id, tx);
        expect(serializePlanExport(first, "json")).toBe(
          serializePlanExport(second, "json"),
        );
        expect(serializePlanExport(first, "csv")).toBe(
          serializePlanExport(second, "csv"),
        );
        expect(first.metrics).toEqual(plan.metrics);
        expect(first.objectives).toEqual(plan.objectives);
        expect(first.provenance).toMatchObject({
          planId: plan.id,
          inputDigest: plan.inputDigest,
          sourceRevision: plan.sourceRevision,
          generatedAt: plan.createdAt,
        });
        expect(
          first.placements.map(
            ({ requestId, teamId, startMinute, endMinute, locked }) => ({
              requestId,
              teamId,
              startMinute,
              endMinute,
              locked,
            }),
          ),
        ).toEqual(plan.placements);
        expect(
          first.deferrals.map(({ requestId, bindingRuleIds, reason }) => ({
            requestId,
            bindingRuleIds,
            reason,
          })),
        ).toEqual(plan.deferred);
        const [stored] =
          await tx`select facts,parameters,result from railplan_private.planning_runs where id=${plan.id}`;
        expect(first.facts).toEqual(stored.facts);
        expect(first.parameters).toEqual(stored.parameters);
        expect(first.provenance.solveMs).toBe(stored.result.solveMs);
        await tx`reset role`;
        expect(
          (
            await tx`select revision,lock_generation from railplan_private.planning_source`
          )[0],
        ).toEqual(before);
      }));
    it("marks changed source stale while preserving saved text, schedule and metrics", () =>
      fixture(async (tx, p) => {
        const plan = await createPlan(p, input, tx),
          before = await getPlanExport(p, plan.id, tx);
        await tx`update public.maintenance_requests set title='Current changed title 工程' where id='M-001'`;
        const after = await getPlanExport(p, plan.id, tx);
        expect(after.assessment).toMatchObject({
          stale: true,
          sourceFreshness: "stale",
        });
        expect(after.assessment.currentSourceRevision).not.toBe(
          before.assessment.currentSourceRevision,
        );
        expect(after.facts).toEqual(before.facts);
        expect(after.placements).toEqual(before.placements);
        expect(after.metrics).toEqual(before.metrics);
        expect(after.provenance).toEqual(before.provenance);
        expect(
          after.facts.requests.find((r) => r.id === "M-001")!.title,
        ).not.toBe("Current changed title 工程");
      }));
    it("exports superseded and infeasible saved versions honestly and denies contractor access including direct freshness reads", () =>
      fixture(async (tx, p, c) => {
        const first = await createPlan(p, input, tx);
        await publishPlan(p, first.id, tx);
        const second = await createPlan(p, input, tx);
        await publishPlan(p, second.id, tx);
        const old = await getPlanExport(p, first.id, tx);
        expect(old.assessment).toMatchObject({
          publicationState: "superseded",
          supersededBy: second.id,
        });
        expect(old.metrics).toEqual((await getPlan(p, first.id, tx)).metrics);
        await tx`update public.workforce_availability set people_count=0 where planning_night=${PLANNING_NIGHT}`;
        const impossible = await createPlan(p, input, tx),
          exported = await getPlanExport(p, impossible.id, tx);
        expect(exported.provenance.status).toBe("INFEASIBLE");
        expect(exported.validation.independentlyValidated).toBe(false);
        expect(exported.deferrals.length).toBeGreaterThan(0);
        expect(serializePlanExport(exported, "csv")).toContain(
          "Infeasible saved result",
        );
        await expect(getPlanExport(c, first.id, tx)).rejects.toMatchObject({
          code: "forbidden",
        });
        await withAuthenticatedTransaction(
          c,
          async (db) => {
            await expect(
              db.savepoint(
                (s) =>
                  s`select railplan_private.read_current_planning_source()`,
              ),
            ).rejects.toMatchObject({ code: "42501" });
          },
          tx,
        );
      }));
  },
);
