import type { TransactionSql } from "postgres";
import type { PlanningInstance } from "@railplan/core/domain/instance";
import type { PlanExport } from "@railplan/core/types/exports";
import type {
  Placement,
  DeferredRequest,
  SolveResult,
} from "@railplan/core/types/railplan";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import { requireAction } from "@/lib/auth/permissions";
import type { Sql } from "@/lib/db/client";
import { PlanError } from "@/lib/plans/input";
import { makePlanExport } from "./serialize";
interface ExportRow {
  id: string;
  planning_night: string;
  source_revision: string;
  input_digest: string;
  facts: PlanningInstance;
  parameters: PlanExport["parameters"];
  result: Omit<SolveResult, "plan">;
  created_by: string;
  created_at: Date;
  published_at: Date | null;
  superseded_by: string | null;
}
/** No solver, validation rerun, current-facts loader, or exploratory store call.
 * All saved content plus dynamic publication/source observations share one MVCC
 * snapshot. The freshness reader neither writes nor locks the source row. */
export async function getPlanExport(
  identity: VerifiedIdentity,
  id: string,
  connection?: Sql | TransactionSql,
): Promise<PlanExport> {
  return withAuthenticatedTransaction(
    identity,
    async (tx, actor) => {
      requireAction(actor, "solve");
      const [row] = await tx<
        ExportRow[]
      >`select r.*,r.planning_night::text,r.source_revision::text,p.created_at as published_at,later.plan_id as superseded_by
   from railplan_private.planning_runs r left join railplan_private.plan_publications p on p.plan_id=r.id
   left join railplan_private.plan_publications later on later.supersedes=r.id where r.id=${id}::uuid`;
      if (!row)
        throw new PlanError("not_found", "This saved plan does not exist.");
      const placements = await tx<
        Placement[]
      >`select request_id as "requestId",team_id as "teamId",start_minute as "startMinute",end_minute as "endMinute",locked
   from railplan_private.plan_placements where plan_id=${id}::uuid order by position`;
      const deferred = await tx<
        DeferredRequest[]
      >`select request_id as "requestId",binding_rule_ids as "bindingRuleIds",reason
   from railplan_private.plan_deferrals where plan_id=${id}::uuid order by position`;
      const [{ revision }] = await tx<
        { revision: string }[]
      >`select railplan_private.read_current_planning_source()::text as revision`;
      return makePlanExport({
        id: row.id,
        planningNight: row.planning_night,
        sourceRevision: row.source_revision,
        inputDigest: row.input_digest,
        facts: row.facts,
        parameters: row.parameters,
        result: { ...row.result, plan: { placements, deferred } },
        createdBy: row.created_by,
        createdAt: row.created_at.toISOString(),
        publishedAt: row.published_at?.toISOString() ?? null,
        supersededBy: row.superseded_by,
        currentSourceRevision: revision,
      });
    },
    connection,
    "repeatable read",
  );
}
