import type { TransactionSql } from "postgres";
import type { PlanningInstance } from "@railplan/core/domain/instance";
import { buildWorld } from "@railplan/core/domain/world";
import { buildSubmittedPlan, solve, SOLVER_VERSION } from "@railplan/core/engine/solve";
import { groupConflicts } from "@railplan/core/engine/conflicts";
import { recommendResolution } from "@railplan/core/engine/resolutions";
import {
  validate,
  isFeasible,
  CONSTRAINT_VERSION,
} from "@railplan/core/engine/validate";
import { explainPlacement } from "@railplan/core/engine/explain";
import { findAlternatives } from "@railplan/core/engine/alternatives";
import type { VerifiedIdentity } from "@/lib/auth/session";
import type { Sql } from "@/lib/db/client";
import { PlanError, planInputDigest, validatePlanParameters } from "./input";
import { analysisSchema, type AnalysisInput } from "./schemas";
import { read, transaction } from "./service";
import type {
  PlanAnalysis,
  PlanParameters,
  PlanPreview,
} from "./workspace-types";

function assertAnalysisBounds(facts: PlanningInstance) {
  if (
    facts.requests.length > 100 ||
    facts.window.endMinute - facts.window.startMinute > 1440 ||
    facts.window.slotMinutes < 5
  )
    throw new PlanError(
      "invalid_request",
      "This planning night exceeds the supported solve bounds.",
    );
}
export function solvePreview(
  facts: PlanningInstance,
  parameters: PlanParameters,
) {
  assertAnalysisBounds(facts);
  validatePlanParameters(facts, parameters);
  const world = buildWorld(facts);
  const result = solve({
    strategy: parameters.strategy,
    locked: parameters.locked.map((p) => ({ ...p, locked: true })),
    context: { world },
  });
  result.violations = validate(result.plan, { world });
  result.independentlyValidated =
    isFeasible(result.violations) &&
    facts.requests
      .filter((r) => r.mandatory)
      .every((r) => result.plan.placements.some((p) => p.requestId === r.id));
  if (!result.independentlyValidated) result.status = "INFEASIBLE";
  return result;
}
function requestedReview(facts: PlanningInstance, parameters: PlanParameters) {
  assertAnalysisBounds(facts);
  validatePlanParameters(facts, parameters);
  const world = buildWorld(facts);
  const plan = buildSubmittedPlan(world.requests);
  plan.placements = plan.placements.map(placement => {
    const pin = parameters.locked.find(item => item.requestId === placement.requestId);
    return pin ? { ...pin, locked: true } : placement;
  });
  return { plan, context: { world }, violations: validate(plan, { world }) };
}

/** Requested-time clashes are not violations of the currently saved schedule. */
export function reviewRequestedConflicts(facts: PlanningInstance, parameters: PlanParameters) {
  return groupConflicts(requestedReview(facts, parameters).violations);
}

export function previewConflictRepair(facts: PlanningInstance, parameters: PlanParameters, violationId: string) {
  const requested = requestedReview(facts, parameters);
  const violation = requested.violations.find(item => item.id === violationId);
  if (!violation) throw new PlanError("invalid_request", "This clash changed. Refresh the conflict review.");
  const resolution = recommendResolution(requested.plan, violation, requested.context);
  if (!resolution) throw new PlanError("invalid_request", "No single validated move repairs this finding. Inspect its requests for alternatives.");
  const request = requested.context.world.requestById[resolution.requestId];
  const next = { ...parameters, locked: [
    ...parameters.locked.filter(pin => pin.requestId !== request.id),
    { requestId: request.id, teamId: request.teamId, startMinute: resolution.toMinute, endMinute: resolution.endMinute, locked: true },
  ] };
  const result = solvePreview(facts, next);
  if (!result.independentlyValidated || result.status === "INFEASIBLE")
    throw new PlanError("invalid_request", "This repair cannot produce a valid full schedule with the current pins. Inspect alternatives instead.");
  return { result, parameters: next };
}

export async function analysePlan(
  identity: VerifiedIdentity,
  id: string,
  raw: AnalysisInput,
  connection?: Sql | TransactionSql,
): Promise<PlanAnalysis> {
  const input = analysisSchema.parse(raw);
  return transaction(
    identity,
    async (tx) => {
      const { row, plan } = await read(tx, id);
      assertAnalysisBounds(row.facts);
      const [{ revision }] = await tx<
        { revision: string }[]
      >`select railplan_private.read_current_planning_source()::text as revision`;
      const stale = row.source_revision !== revision;
      const locked = (input.locked ?? row.parameters.locked).map((p) => ({
        ...p,
        locked: true,
      }));
      if (input.operation === "conflicts" || input.operation === "repair") {
        const parameters = { planningNight: row.planning_night, strategy: input.strategy, locked };
        if (input.operation === "conflicts")
          return { operation: "conflicts", groups: reviewRequestedConflicts(row.facts, parameters), stale, currentSourceRevision: revision };
        if (stale || plan.publishState === "superseded" ||
            row.result.solverVersion !== SOLVER_VERSION || row.result.constraintVersion !== CONSTRAINT_VERSION)
          throw new PlanError("invalid_request", "Open or generate a current version before previewing repairs.");
        const proposal = previewConflictRepair(row.facts, parameters, input.violationId);
        return {
          operation: "preview",
          ...proposal,
          stale,
          currentSourceRevision: revision,
          basis: {
            planId: id, sourceRevision: row.source_revision,
            solverVersion: SOLVER_VERSION, constraintVersion: CONSTRAINT_VERSION,
            inputDigest: planInputDigest(row.facts, proposal.parameters),
          },
        };
      }
      const preview = (strategy: PlanParameters["strategy"]): PlanPreview => {
        const parameters = {
          planningNight: row.planning_night,
          strategy,
          locked,
        };
        return {
          result: solvePreview(row.facts, parameters),
          parameters,
          basis: {
            planId: id,
            sourceRevision: row.source_revision,
            solverVersion: SOLVER_VERSION,
            constraintVersion: CONSTRAINT_VERSION,
            inputDigest: planInputDigest(row.facts, parameters),
          },
          stale,
          currentSourceRevision: revision,
        };
      };
      if (input.operation === "compare-objectives")
        return {
          operation: input.operation,
          comparisons: (
            [
              "balanced",
              "max-completion",
              "min-risk",
              "min-changes",
              "emergency-buffer",
            ] as const
          ).map(preview),
          stale,
          currentSourceRevision: revision,
        };
      if (input.operation === "preview")
        return { operation: input.operation, ...preview(input.strategy) };
      const parameters = {
        planningNight: row.planning_night,
        strategy: row.parameters.strategy,
        locked,
      };
      const value: PlanPreview =
        input.strategy !== undefined || input.locked !== undefined
          ? preview(input.strategy ?? row.parameters.strategy)
          : {
              result: {
                ...row.result,
                plan: { placements: plan.placements, deferred: plan.deferred },
              },
              parameters,
              basis: {
                planId: id,
                sourceRevision: row.source_revision,
                solverVersion: row.result.solverVersion,
                constraintVersion: row.result.constraintVersion,
                inputDigest: row.input_digest,
              },
              stale,
              currentSourceRevision: revision,
            };
      const world = buildWorld(row.facts);
      const explanation = explainPlacement(value.result.plan, input.requestId, {
        world,
      });
      if (!explanation)
        throw new PlanError(
          "not_found",
          "This request is not in the saved planning facts.",
        );
      const alternatives = findAlternatives(
        value.result.plan,
        input.requestId,
        { world },
      );
      return {
        operation: input.operation,
        ...value,
        requestId: input.requestId,
        explanation,
        ...alternatives,
      };
    },
    connection,
  );
}
