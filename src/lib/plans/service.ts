import type { TransactionSql } from "postgres";
import {
  canonicalise,
  type PlanningInstance,
} from "@railplan/core/domain/instance";
import { buildWorld } from "@railplan/core/domain/world";
import { solve, SOLVER_VERSION } from "@railplan/core/engine/solve";
import {
  validate,
  isFeasible,
  CONSTRAINT_VERSION,
} from "@railplan/core/engine/validate";
import type { PlanVersion, PlannerDecision } from "@railplan/core/types/plans";
import type {
  DeferredRequest,
  Placement,
  SolveResult,
} from "@railplan/core/types/railplan";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import { requireAction } from "@/lib/auth/permissions";
import { loadPlanningInstance } from "@/lib/db/instance";
import type { Sql } from "@/lib/db/client";
import { PlanError, planInputDigest, validatePlanParameters } from "./input";
import {
  createPlanSchema,
  decisionSchema,
  type CreatePlanInput,
  type DecisionInput,
} from "./schemas";

type Connection = Sql | TransactionSql;
interface RunRow {
  id: string;
  planning_night: string;
  source_revision: string;
  input_digest: string;
  facts: PlanningInstance;
  parameters: CreatePlanInput;
  result: Omit<SolveResult, "plan">;
  created_by: string;
  created_at: Date;
  published_at: Date | null;
  superseded_by: string | null;
}
/** The isolation level is chosen at BEGIN, before the trusted profile read.
 * Revision locks conflict with every planning-fact write; retry a changed MVCC
 * snapshot from scratch, never reuse a partially read set of inputs. */
async function transaction<T>(
  identity: VerifiedIdentity,
  work: (tx: TransactionSql) => Promise<T>,
  connection?: Connection,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withAuthenticatedTransaction(
        identity,
        async (tx, actor) => {
          requireAction(actor, "solve");
          return work(tx);
        },
        connection,
        "repeatable read",
      );
    } catch (error) {
      if (
        !connection &&
        attempt < 2 &&
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["40001", "40P01"].includes(String(error.code))
      )
        continue;
      throw error;
    }
  }
}
function version(
  row: RunRow,
  placements: Placement[],
  deferred: DeferredRequest[],
): PlanVersion {
  return {
    id: row.id,
    planningNight: row.planning_night,
    sourceRevision: row.source_revision,
    inputDigest: row.input_digest,
    strategy: row.parameters.strategy,
    solverVersion: row.result.solverVersion,
    constraintVersion: row.result.constraintVersion,
    status: row.result.status,
    objectives: row.result.objective,
    metrics: row.result.metrics,
    validation: {
      independentlyValidated: row.result.independentlyValidated,
      violations: row.result.violations,
    },
    placements,
    deferred,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    publishState: row.superseded_by
      ? "superseded"
      : row.published_at
        ? "published"
        : "draft",
    publishedAt: row.published_at?.toISOString() ?? null,
    supersededBy: row.superseded_by,
  };
}
async function readMany(
  tx: TransactionSql,
  ids: string[],
): Promise<{ plan: PlanVersion; row: RunRow }[]> {
  if (!ids.length) return [];
  const rows = await tx<
    RunRow[]
  >`select r.*,r.planning_night::text,r.source_revision::text,
    p.created_at as published_at,later.plan_id as superseded_by
    from railplan_private.planning_runs r
    left join railplan_private.plan_publications p on p.plan_id=r.id
    left join railplan_private.plan_publications later on later.supersedes=r.id where r.id in ${tx(ids)}`;
  const placements = await tx<
    (Placement & { planId: string })[]
  >`select plan_id as "planId",request_id as "requestId",team_id as "teamId", start_minute as "startMinute", end_minute as "endMinute",locked from railplan_private.plan_placements where plan_id in ${tx(ids)} order by position`;
  const deferred = await tx<
    (DeferredRequest & { planId: string })[]
  >`select plan_id as "planId",request_id as "requestId",binding_rule_ids as "bindingRuleIds",reason from railplan_private.plan_deferrals where plan_id in ${tx(ids)} order by position`;
  return rows.map((row) => ({
    row,
    plan: version(
      row,
      placements
        .filter((p) => p.planId === row.id)
        .map(({ requestId, teamId, startMinute, endMinute, locked }) => ({
          requestId,
          teamId,
          startMinute,
          endMinute,
          locked,
        })),
      deferred
        .filter((d) => d.planId === row.id)
        .map(({ requestId, bindingRuleIds, reason }) => ({
          requestId,
          bindingRuleIds,
          reason,
        })),
    ),
  }));
}
async function read(
  tx: TransactionSql,
  id: string,
): Promise<{ plan: PlanVersion; row: RunRow }> {
  const [result] = await readMany(tx, [id]);
  if (!result) throw new PlanError("not_found", "This plan does not exist.");
  return result;
}
export async function createPlan(
  identity: VerifiedIdentity,
  raw: CreatePlanInput,
  connection?: Connection,
): Promise<PlanVersion> {
  const input = createPlanSchema.parse(raw);
  return transaction(
    identity,
    async (tx) => {
      const [{ revision }] = await tx<
        { revision: string }[]
      >`select railplan_private.lock_planning_source()::text as revision`;
      if (
        !(
          await tx`select planning_night from public.planning_nights where planning_night=${input.planningNight}`
        ).length
      )
        throw new PlanError("not_found", "This planning night does not exist.");
      const facts = canonicalise(
        await loadPlanningInstance(tx, input.planningNight),
      );
      if (input.basedOnPlanId) {
        const base = await read(tx, input.basedOnPlanId);
        // Check under the same source lock/snapshot as the new solve. Never
        // silently apply a reviewed change to different facts or engine rules.
        if (
          base.plan.planningNight !== input.planningNight ||
          base.plan.sourceRevision !== revision ||
          base.plan.publishState === "superseded" ||
          base.plan.solverVersion !== SOLVER_VERSION ||
          base.plan.constraintVersion !== CONSTRAINT_VERSION ||
          planInputDigest(facts, base.row.parameters) !== base.row.input_digest ||
          planInputDigest(base.row.facts, base.row.parameters) !== base.row.input_digest
        ) throw new PlanError("stale_plan",
          "The reviewed version is no longer current. Generate a fresh plan and review the changes again.");
      }
      // A bounded prototype workload. Larger datasets require a background solve
      // budget and are rejected before invoking the synchronous heuristic.
      if (
        facts.requests.length > 100 ||
        facts.window.endMinute - facts.window.startMinute > 1440 ||
        facts.window.slotMinutes < 5
      )
        throw new PlanError(
          "invalid_request",
          "This planning night exceeds the supported solve bounds.",
        );
      validatePlanParameters(facts, input);
      const world = buildWorld(facts);
      const result = solve({
        strategy: input.strategy,
        locked: input.locked.map((p) => ({ ...p, locked: true })),
        context: { world },
      });
      const violations = validate(result.plan, { world });
      result.violations = violations;
      result.independentlyValidated =
        isFeasible(violations) &&
        facts.requests
          .filter((r) => r.mandatory)
          .every((r) =>
            result.plan.placements.some((p) => p.requestId === r.id),
          );
      const digest = planInputDigest(facts, input);
      const [{ id }] = await tx<
        { id: string }[]
      >`select railplan_private.save_generated_plan(${input.planningNight}::date,${revision}::bigint,${digest},${tx.json(facts as never)},${tx.json(input as never)},${tx.json(result as never)}) as id`;
      return (await read(tx, id)).plan;
    },
    connection,
  );
}
export async function getPlan(
  identity: VerifiedIdentity,
  id: string,
  connection?: Connection,
): Promise<PlanVersion> {
  return transaction(
    identity,
    async (tx) => (await read(tx, id)).plan,
    connection,
  );
}
export async function listPlans(
  identity: VerifiedIdentity,
  night: string,
  connection?: Connection,
): Promise<PlanVersion[]> {
  return transaction(
    identity,
    async (tx) => {
      const rows = await tx<
        { id: string }[]
      >`select id from railplan_private.planning_runs where planning_night=${night} order by created_at desc,id desc limit 20`;
      const records = await readMany(
        tx,
        rows.map((row) => row.id),
      );
      return rows.map(
        (row) => records.find((record) => record.row.id === row.id)!.plan,
      );
    },
    connection,
  );
}
export async function recordDecision(
  identity: VerifiedIdentity,
  id: string,
  raw: DecisionInput,
  connection?: Connection,
): Promise<PlannerDecision> {
  const input = decisionSchema.parse(raw);
  return transaction(
    identity,
    async (tx) => {
      await read(tx, id);
      const [{ decisionId }] = await tx<
        { decisionId: string }[]
      >`select railplan_private.record_plan_decision(${id}::uuid,${input.kind},${input.reason}) as "decisionId"`;
      const [decision] = await tx<
        {
          id: string;
          plan_id: string;
          kind: PlannerDecision["kind"];
          reason: string;
          created_by: string;
          created_at: Date;
        }[]
      >`select * from railplan_private.planner_decisions where id=${decisionId}`;
      return {
        id: decision.id,
        planId: decision.plan_id,
        kind: decision.kind,
        reason: decision.reason,
        createdBy: decision.created_by,
        createdAt: decision.created_at.toISOString(),
      };
    },
    connection,
  );
}
export async function publishPlan(
  identity: VerifiedIdentity,
  id: string,
  connection?: Connection,
): Promise<PlanVersion> {
  const outcome = await transaction(
    identity,
    async (tx) => {
      const [{ revision }] = await tx<
        { revision: string }[]
      >`select railplan_private.lock_planning_source()::text as revision`;
      const { row, plan } = await read(tx, id);
      // An idempotent call does not republish a superseded historical version.
      if (plan.publishState !== "draft") return { plan };
      if (row.source_revision !== revision) {
        await tx`select railplan_private.publish_generated_plan(${id}::uuid)`;
        return { error: "stale_plan" as const };
      }
      const facts = await loadPlanningInstance(tx, row.planning_night);
      const violations = validate(
        { placements: plan.placements, deferred: plan.deferred },
        { world: buildWorld(facts) },
      );
      const mandatoryPresent = facts.requests
        .filter((r) => r.mandatory)
        .every((r) => plan.placements.some((p) => p.requestId === r.id));
      if (
        plan.status === "INFEASIBLE" ||
        !plan.validation.independentlyValidated ||
        !isFeasible(violations) ||
        !mandatoryPresent ||
        plan.solverVersion !== SOLVER_VERSION ||
        plan.constraintVersion !== CONSTRAINT_VERSION ||
        planInputDigest(facts, row.parameters) !== row.input_digest ||
        planInputDigest(row.facts, row.parameters) !== row.input_digest
      )
        return { error: "invalid_plan" as const };
      const [{ result }] = await tx<
        { result: string }[]
      >`select railplan_private.publish_generated_plan(${id}::uuid) as result`;
      if (result !== "ok")
        return {
          error:
            result === "stale_plan"
              ? ("stale_plan" as const)
              : ("invalid_plan" as const),
        };
      return { plan: (await read(tx, id)).plan };
    },
    connection,
  );
  // Deliberately outside transaction: stale rejection audit survives HTTP 409.
  if (outcome.error)
    throw new PlanError(
      outcome.error,
      outcome.error === "stale_plan"
        ? "Planning inputs changed. Generate a fresh version before publishing."
        : "This version cannot be published. Generate and validate a new version.",
    );
  return outcome.plan!;
}
