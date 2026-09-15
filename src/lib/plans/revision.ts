import { buildWorld } from "@railplan/core/domain/world";
import { findAlternatives } from "@railplan/core/engine/alternatives";
import { explainPlacement } from "@railplan/core/engine/explain";
import { recommendResolution } from "@railplan/core/engine/resolutions";
import { buildSubmittedPlan, solve, SOLVER_VERSION } from "@railplan/core/engine/solve";
import { CONSTRAINT_VERSION, isFeasible, validate } from "@railplan/core/engine/validate";
import type { PlanExport } from "@railplan/core/types/exports";
import type { Placement, Violation } from "@railplan/core/types/railplan";

export const revisionEngineMatches = (snapshot: PlanExport) =>
  snapshot.provenance.solverVersion === SOLVER_VERSION &&
  snapshot.provenance.constraintVersion === CONSTRAINT_VERSION;

/** Unsaved proposals use the same engine and explicit saved facts. The server
 * still loads current facts, checks the source version and recomputes on save. */
export function previewRevision(snapshot: PlanExport, locked: Placement[]) {
  if (!revisionEngineMatches(snapshot)) throw new Error("Reload the page to use the current planning engine before revising.");
  const world = buildWorld(snapshot.facts);
  const context = { world };
  // The night exactly as requested, before any placement moved. Conflicts and
  // recommended fixes are read against this plan: it is what the requesters asked
  // for, and it is the baseline the planner is choosing to depart from.
  const requestedPlan = buildSubmittedPlan(world.requests);
  const requestedViolations = validate(requestedPlan, context);
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
  return { context, requestedPlan, requestedViolations, result, mandatoryMissing, feasible, changes };
}
export type RevisionPreview = ReturnType<typeof previewRevision>;

/** Counterfactual for one request: put it back at its requested time against the
 * proposed plan and report what breaks. Null for an unknown request. */
export function explainFor(preview: RevisionPreview, requestId: string) {
  return explainPlacement(preview.result.plan, requestId, preview.context);
}

/** Other validated start times for one request with the rest of the proposal held still. */
export function alternativesFor(preview: RevisionPreview, requestId: string) {
  return findAlternatives(preview.result.plan, requestId, preview.context);
}

/** The single cheapest move that clears one requested-time conflict without
 * creating another, or null when every start time trades it for a new one. */
export function resolutionFor(preview: RevisionPreview, violation: Violation) {
  return recommendResolution(preview.requestedPlan, violation, preview.context);
}
