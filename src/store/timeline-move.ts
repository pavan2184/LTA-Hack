import { useRailPlanStore } from "./useRailPlanStore";
import { buildDisruptionInputs, disruptionById } from "@railplan/core/data/disruptions";
import { literalWorld } from "@railplan/core/domain/world";
import { solve } from "@railplan/core/engine/solve";
import type { Placement, SolveResult } from "@railplan/core/types/railplan";

type State = ReturnType<typeof useRailPlanStore.getState>;
export type TimelineMovePreview = {
  source: State;
  requestId: string;
  startMinute: number;
  result: SolveResult | null;
  pin: Placement | null;
  error: string | null;
};
export type TimelineMoveUndo = { before: State; after: State };

/** Selection changes are harmless; changes to any planning input invalidate a preview/undo. */
export function sameTimelinePlan(a: State, b: State) {
  return a.stage === "idle" && b.stage === "idle" && a.planned === b.planned &&
    a.submitted === b.submitted && a.locked === b.locked && a.view === b.view &&
    a.strategy === b.strategy && a.activeDisruptionId === b.activeDisruptionId && a.hasReplanned === b.hasReplanned;
}
export function previewTimelineMove(requestId: string, startMinute: number): TimelineMovePreview {
  const source = useRailPlanStore.getState();
  const preview: TimelineMovePreview = { source, requestId, startMinute, result: null, pin: null, error: null };
  const fail = (error: string) => ({ ...preview, error });
  if (source.stage !== "idle" || source.view !== "planned" || !source.planned)
    return fail("Generate a draft schedule before dragging work.");
  if (source.activeDisruptionId && !source.hasReplanned) return fail("Replan around the disruption first.");
  const world = literalWorld();
  const request = world.requestById[requestId];
  const current = source.planned.plan.placements.find((p) => p.requestId === requestId);
  if (!request || !current) return fail("Only scheduled, non-emergency work can be moved.");
  if (source.locked[requestId] || current.locked) return fail("Unpin this request before dragging it.");
  if (!Number.isFinite(startMinute) || (startMinute - world.windowStart) % world.slotMinutes !== 0)
    return fail(`Choose a time on the ${world.slotMinutes}-minute grid.`);
  const scenario = source.activeDisruptionId ? disruptionById[source.activeDisruptionId] : null;
  const inputs = scenario ? buildDisruptionInputs(scenario, source.planned.plan.placements) : null;
  if (inputs?.locked.some((p) => p.requestId === requestId)) return fail("This time is fixed by the disruption.");
  if (startMinute < Math.max(world.windowStart, request.earliestStart) ||
      startMinute + request.durationMinutes > request.latestEnd ||
      startMinute + request.durationMinutes + request.clearanceMinutes > (inputs?.context.windowEnd ?? world.windowEnd))
    return fail("Work and clearance must fit the request window and engineering handback.");
  const pin = { ...current, startMinute, endMinute: startMinute + request.durationMinutes, locked: true };
  const result = solve({ strategy: source.strategy, locked: [...Object.values(source.locked), pin, ...(inputs?.locked ?? [])], requests: inputs?.requests, context: inputs?.context });
  const violations = result.violations.filter((v) => v.severity === "critical");
  return { ...preview, pin, result, error: violations.length ? violations.map((v) => v.detail).join(" ") :
    !result.independentlyValidated || result.status === "INFEASIBLE" ? "This placement cannot produce a validated draft." : null };
}
export function applyTimelineMove(preview: TimelineMovePreview): TimelineMoveUndo | null {
  const before = useRailPlanStore.getState();
  if (!sameTimelinePlan(before, preview.source) || preview.error || !preview.result || !preview.pin) return null;
  useRailPlanStore.setState({
    planned: preview.result, locked: { ...before.locked, [preview.requestId]: preview.pin },
    plannedDisruptionId: before.activeDisruptionId, hasReplanned: Boolean(before.activeDisruptionId),
    lastSolveMs: preview.result.solveMs, disruptionImpact: [], disruptionMetrics: null, disruptionPlacements: [],
    selectedRequestId: preview.requestId, selectedViolationId: null,
  });
  return { before, after: useRailPlanStore.getState() };
}
export function undoTimelineMove(undo: TimelineMoveUndo): boolean {
  if (!sameTimelinePlan(useRailPlanStore.getState(), undo.after)) return false;
  const { planned, locked, plannedDisruptionId, hasReplanned, lastSolveMs, disruptionImpact, disruptionMetrics, disruptionPlacements } = undo.before;
  useRailPlanStore.setState({ planned, locked, plannedDisruptionId, hasReplanned, lastSolveMs, disruptionImpact, disruptionMetrics, disruptionPlacements });
  return true;
}
