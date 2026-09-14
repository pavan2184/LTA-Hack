import { buildWorld } from "@railplan/core/domain/world";
import { buildSubmittedPlan, solve, SOLVER_VERSION } from "@railplan/core/engine/solve";
import { CONSTRAINT_VERSION, isFeasible, validate } from "@railplan/core/engine/validate";
import type { PlanExport } from "@railplan/core/types/exports";
import type { Placement } from "@railplan/core/types/railplan";

export const revisionEngineMatches = (snapshot: PlanExport) =>
  snapshot.provenance.solverVersion === SOLVER_VERSION &&
  snapshot.provenance.constraintVersion === CONSTRAINT_VERSION;

/** Unsaved proposals use the same engine and explicit saved facts. The server
 * still loads current facts, checks the source version and recomputes on save. */
export function previewRevision(snapshot: PlanExport, locked: Placement[]) {
  if (!revisionEngineMatches(snapshot)) throw new Error("Reload the page to use the current planning engine before revising.");
  const world = buildWorld(snapshot.facts);
  const context = { world };
  const requestedViolations = validate(buildSubmittedPlan(world.requests), context);
  const result = solve({ strategy: snapshot.parameters.strategy, locked, context });
  const mandatoryMissing = world.requests.filter(request => request.mandatory &&
    !result.plan.placements.some(p => p.requestId === request.id));
  const feasible = isFeasible(result.violations) && mandatoryMissing.length === 0;
  const changes = world.requests.flatMap(request => {
    const before = snapshot.placements.find(p => p.requestId === request.id);
    const after = result.plan.placements.find(p => p.requestId === request.id);
    if (before?.startMinute === after?.startMinute && before?.endMinute === after?.endMinute &&
      before?.teamId === after?.teamId && Boolean(before?.locked) === Boolean(after?.locked)) return [];
    return [{ request, before, after,
      reason: result.plan.deferred.find(d => d.requestId === request.id)?.reason }];
  });
  return { context, requestedViolations, result, mandatoryMissing, feasible, changes };
}
