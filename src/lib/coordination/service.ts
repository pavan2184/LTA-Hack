import type { TransactionSql } from "postgres";
import type { CoordinationCase, CoordinationCasePage, CoordinationActionResult, CoordinationProposal, PlannerCoordinationCase } from "@railplan/core/types/coordination";
import { withAuthenticatedTransaction, type VerifiedIdentity } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/permissions";
import type { Sql } from "@/lib/db/client";
import { analysePlan, solvePreview } from "@/lib/plans/analysis";
import { createPlanInTransaction, read, transaction } from "@/lib/plans/service";
import { PlanError, planInputDigest } from "@/lib/plans/input";
import { planIdSchema } from "@/lib/plans/schemas";
import { createCaseSchema, caseActionSchema, caseFiltersSchema, type CreateCaseInput, type CaseActionInput, type CaseFilters } from "./schemas";
import { coordinationDigest, deriveChanges, semanticResultDigest } from "./impact";

type Connection = Sql | TransactionSql;
export class CoordinationError extends Error {
  constructor(public readonly code: "not_found" | "forbidden" | "conflict" | "invalid_request" | "stale_plan" | "invalid_plan", message?: string) {
    super(message ?? (code === "conflict" ? "This case changed. Reload before trying again." : code === "not_found" ? "This coordination case does not exist." : "The coordination action could not be completed."));
  }
}
function check<T extends { error?: CoordinationError["code"] }>(result: T): T {
  if (result.error) throw new CoordinationError(result.error);
  return result;
}
async function readCase(tx: TransactionSql, id: string): Promise<CoordinationCase> {
  const [{ value }] = await tx<{ value: CoordinationCase | null }[]>`select railplan_private.read_coordination_case(${id}::uuid) as value`;
  if (!value) throw new CoordinationError("not_found");
  return value;
}
export async function getCase(identity: VerifiedIdentity, id: string, connection?: Connection): Promise<CoordinationCase> {
  planIdSchema.parse(id);
  return withAuthenticatedTransaction(identity, tx => readCase(tx, id), connection);
}
export async function listCases(identity: VerifiedIdentity, raw: CaseFilters = {}, connection?: Connection): Promise<CoordinationCasePage> {
  const filters = caseFiltersSchema.parse(raw);
  return withAuthenticatedTransaction(identity, async (tx, actor) => {
    if (actor.role !== "planner" && (filters.ownerId || filters.appliedPlanId)) throw new AuthError("forbidden");
    const rows = await tx<{ value: CoordinationCase }[]>`select railplan_private.list_coordination_cases(${tx.json(filters)}) as value`;
    const cases = rows.slice(0, filters.limit).map(r => r.value);
    const owners = actor.role === "planner" ? (await tx<{ owners: { id: string; isCurrentUser: boolean }[] }[]>`select railplan_private.coordination_owners() as owners`)[0].owners : undefined;
    return { cases, nextCursor: rows.length > filters.limit ? cases.at(-1)!.id : null, ...(owners ? { owners } : {}) };
  }, connection);
}
async function proposal(identity: VerifiedIdentity, tx: TransactionSql, sourcePlanId: string, parameters: CreateCaseInput["parameters"], selectedIds: string[]) {
  const { row, plan } = await read(tx, sourcePlanId);
  if (row.planning_night !== parameters.planningNight || selectedIds.some(id => !row.facts.requests.some(r => r.id === id))) throw new CoordinationError("invalid_request", "Select requests in the source plan's engineering night.");
  const preview = await analysePlan(identity, sourcePlanId, { operation: "preview", strategy: parameters.strategy, locked: parameters.locked }, tx);
  if (preview.operation !== "preview") throw new CoordinationError("invalid_request");
  if (preview.stale) throw new PlanError("stale_plan", "Generate a fresh source plan before revising this proposal.");
  if (!preview.result.independentlyValidated || preview.result.status === "INFEASIBLE") throw new PlanError("invalid_plan", "The proposal must pass validation and include mandatory work.");
  const owners = await tx<{ requestId: string; organisationId: string; submissionRevision: number }[]>`
    select 'R-'||s.id as "requestId",s.organisation_id as "organisationId",r.version as "submissionRevision"
    from railplan_private.request_submissions s join railplan_private.request_revisions r on r.submission_id=s.id
    join jsonb_array_elements(${tx.json(row.facts as never)}->'requests') f on f->>'id'='R-'||s.id and (f->>'submissionRevision')::integer=r.version where r.status='approved'`;
  const changes = deriveChanges({ placements: plan.placements, deferred: plan.deferred }, preview.result.plan, owners);
  return { sourcePlanId, sourceRevision: row.source_revision, sourceDigest: row.input_digest, inputDigest: planInputDigest(row.facts, parameters), solverVersion: preview.result.solverVersion, constraintVersion: preview.result.constraintVersion, parameters: preview.parameters, result: preview.result, resultDigest: semanticResultDigest(preview.result), impactDigest: coordinationDigest(changes), changes, requestRevisions: Object.fromEntries(row.facts.requests.map(r => [r.id, r.submissionRevision ?? null])) };
}
export async function createCase(identity: VerifiedIdentity, raw: CreateCaseInput, connection?: Connection): Promise<CoordinationCase> {
  const input = createCaseSchema.parse(raw);
  return transaction(identity, async tx => {
    await tx`select railplan_private.lock_planning_source()`;
    const digest = coordinationDigest(input);
    const [prior] = await tx<{ id: string; creation_digest: string }[]>`select id,creation_digest from railplan_private.coordination_cases where created_by=${identity.id} and idempotency_key=${input.idempotencyKey}`;
    if (prior) {
      if (prior.creation_digest !== digest) throw new CoordinationError("conflict");
      return readCase(tx, prior.id);
    }
    const evidence = await proposal(identity, tx, input.sourcePlanId, input.parameters, input.selectedRequestIds);
    const [{ value }] = await tx<{ value: { id: string; error?: CoordinationError["code"] } }[]>`select railplan_private.create_coordination_case(${input.sourcePlanId}::uuid,${input.selectedRequestIds}::text[],${input.idempotencyKey}::uuid,${digest},${input.deadline ?? null}::timestamptz,${tx.json(evidence as never)}) as value`;
    return readCase(tx, check(value).id);
  }, connection);
}
function plannerCase(value: CoordinationCase): PlannerCoordinationCase {
  if (value.scope !== "planner") throw new AuthError("forbidden");
  return value;
}
export async function actOnCase(identity: VerifiedIdentity, id: string, raw: CaseActionInput, connection?: Connection): Promise<CoordinationActionResult> {
  planIdSchema.parse(id);
  const input = caseActionSchema.parse(raw);
  const run = async (tx: TransactionSql): Promise<CoordinationActionResult> => {
    // Source lock first, even before the case lock or reading its proposal.
    if (input.action === "apply" || input.action === "revise") await tx`select railplan_private.lock_planning_source()`;
    let current = await readCase(tx, id);
    if (input.action !== "request-changes") plannerCase(current);
    if (current.scope === "planner") {
      await tx`select railplan_private.lock_coordination_case(${id}::uuid)`;
      current = await readCase(tx, id);
    }
    if (input.action === "apply") {
      const [prior] = await tx<{ plan_id: string; revision: number; expected_version: number; actor_id: string }[]>`select * from railplan_private.coordination_applications where case_id=${id} and idempotency_key=${input.idempotencyKey}`;
      if (prior) {
        if (prior.revision !== input.revision || prior.expected_version !== input.expectedVersion || prior.actor_id !== identity.id) throw new CoordinationError("conflict");
        return { case: current, appliedPlanId: prior.plan_id };
      }
    }
    if (current.version !== input.expectedVersion) throw new CoordinationError("conflict");
    if (current.state === "closed" && input.action !== "reopen") throw new CoordinationError("conflict");
    let evidence: Awaited<ReturnType<typeof proposal>> | null = null;
    let appliedPlanId: string | null = null;
    if (input.action === "revise") {
      const selected = plannerCase(current);
      if (input.parameters.planningNight !== current.planningNight) throw new CoordinationError("invalid_request");
      evidence = await proposal(identity, tx, input.sourcePlanId, input.parameters, selected.selectedRequestIds);
    }
    if (input.action === "apply") {
      const p: CoordinationProposal | undefined = plannerCase(current).proposals.find(p => p.revision === input.revision);
      if (!p || p.revision !== current.currentRevision || p.state !== "proposed") throw new CoordinationError("conflict");
      if (p.stale) throw new PlanError("stale_plan", "Generate and review a new proposal before applying.");
      const { row, plan } = await read(tx, p.sourcePlanId);
      // Re-solve the immutable reviewed source, then independently re-solve current
      // planning facts in the plan helper. Neither changed result may be saved.
      const refreshed = solvePreview(row.facts, { ...p.parameters, locked: p.parameters.locked.map(pin => ({ ...pin, locked: true })) });
      if (semanticResultDigest(refreshed) !== p.resultDigest) throw new CoordinationError("conflict", "Proposal output changed. Review a new revision.");
      const owners = p.changes.filter(c => c.organisationId !== null && c.submissionRevision !== null).map(c => ({ requestId: c.requestId, organisationId: c.organisationId!, submissionRevision: c.submissionRevision! }));
      const saved = await createPlanInTransaction(tx, { ...p.parameters, expectedBasis: { planId: p.sourcePlanId, sourceRevision: p.sourceRevision, solverVersion: p.solverVersion, constraintVersion: p.constraintVersion, inputDigest: p.inputDigest } }, result => {
        if (!result.independentlyValidated || result.status === "INFEASIBLE") throw new CoordinationError("invalid_plan");
        if (semanticResultDigest(result) !== p.resultDigest || coordinationDigest(deriveChanges({ placements: plan.placements, deferred: plan.deferred }, result.plan, owners)) !== p.impactDigest) throw new CoordinationError("conflict", "Proposal output changed. Review a new revision.");
      });
      appliedPlanId = saved.id;
    }
    const [{ value }] = await tx<{ value: { id: string; appliedPlanId?: string; error?: CoordinationError["code"] } }[]>`select railplan_private.mutate_coordination_case(${id}::uuid,${tx.json(input as never)},${tx.json(evidence as never)},${appliedPlanId}::uuid) as value`;
    check(value);
    return { case: await readCase(tx, id), ...(value.appliedPlanId ? { appliedPlanId: value.appliedPlanId } : {}) };
  };
  return input.action === "request-changes" ? withAuthenticatedTransaction(identity, run, connection) : transaction(identity, run, connection);
}
