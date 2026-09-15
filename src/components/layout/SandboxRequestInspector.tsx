"use client";

import { useMemo } from "react";
import { requestById } from "@railplan/core/data/requests";
import { disruptionById } from "@railplan/core/data/disruptions";
import { teamById } from "@railplan/core/domain/resources";
import { formatClock } from "@railplan/core/engine/intervals";
import { ruleCatalogue } from "@railplan/core/engine/validate";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import { visiblePlanningInputs } from "@/store/visible-planning-inputs";
import { PlannerRequestHeader } from "@/components/plans/PlannerRequestHeader";
import { RequestInspector } from "@/components/insights/RequestInspector";
import { CorridorMap } from "@/components/network/CorridorMap";

export function SandboxRequestInspector() {
  const id = useRailPlanStore((state) => state.selectedRequestId);
  const result = useRailPlanStore((state) => state.activeResult());
  const locked = useRailPlanStore((state) => state.locked);
  const view = useRailPlanStore((state) => state.view);
  const stage = useRailPlanStore((state) => state.stage);
  const scenarioId = useRailPlanStore((state) => state.activeDisruptionId);
  const hasReplanned = useRailPlanStore((state) => state.hasReplanned);
  const explanationFor = useRailPlanStore((state) => state.explanationFor);
  const alternativesFor = useRailPlanStore((state) => state.alternativesFor);
  const selectRequest = useRailPlanStore((state) => state.selectRequest);
  const toggleLock = useRailPlanStore((state) => state.toggleLock);
  const applySuggestion = useRailPlanStore((state) => state.applySuggestion);
  const moveRequest = useRailPlanStore((state) => state.moveRequest);
  const visible = useMemo(() => visiblePlanningInputs(result, scenarioId ? disruptionById[scenarioId] : null, hasReplanned), [result, scenarioId, hasReplanned]);
  const scenarioRequest = id ? visible?.context.extraRequests?.[id] : null;
  // These store selectors derive their result from the current plan.
  /* eslint-disable react-hooks/exhaustive-deps */
  const explanation = useMemo(() => id && !scenarioRequest ? explanationFor(id) : null, [id, scenarioRequest, result, explanationFor]);
  const alternatives = useMemo(() => id && !scenarioRequest ? alternativesFor(id) : null, [id, scenarioRequest, result, alternativesFor]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const request = id ? requestById[id] : null;
  if (scenarioRequest) return <section className="planner-inspector" aria-label="Demo request inspector"><RequestInspector /></section>;
  if (!request || !result || !visible) return <section className="planner-inspector" aria-label="Demo request inspector"><p className="planner-muted">Select a request to inspect its times and validated alternatives.</p></section>;
  const placement = visible.plan.placements.find((p) => p.requestId === id);
  const deferred = visible.plan.deferred.some((r) => r.requestId === id);
  const disabled = stage !== "idle" || (!!scenarioId && !hasReplanned);
  return <section className="planner-inspector" aria-label="Demo request inspector">
    <PlannerRequestHeader request={request} placement={placement} deferred={deferred} />
    <p className="planner-muted">{teamById[request.teamId]?.name ?? request.teamId}{locked[request.id] ? " · Pinned" : ""}</p>
    <div className="planner-inspector-section" aria-live="polite">
      <h4>Why this placement</h4>
      <p>{explanation?.summary ?? result.plan.deferred.find((r) => r.requestId === id)?.reason}</p>
      {!!explanation?.blockers.length && <details className="mt-3">
        <summary className="planner-link cursor-pointer">What happens at {formatClock(request.preferredStart)}, tested against this plan</summary>
        {explanation.blockers.map((blocker) => <div className="mt-3" key={blocker.id}>
          <p>{ruleCatalogue[blocker.ruleId].label}: {blocker.detail}</p>
          {blocker.requestIds.filter((other) => other !== id).map((other) => <button key={other} type="button" className="planner-link mr-3" onClick={() => selectRequest(other)}>Inspect {other}</button>)}
        </div>)}
      </details>}
    </div>
    <div className="planner-inspector-section">
      <h4>Alternative slots</h4>
      {disabled && scenarioId && <p className="planner-muted">Solve around the disruption before changing slots.</p>}
      {alternatives?.alternatives.length ? alternatives.alternatives.map((option) => <button key={option.id} type="button" className="planner-alternative" disabled={disabled} onClick={() => view === "submitted" ? applySuggestion(option.requestId, option.startMinute) : moveRequest(option.requestId, option.startMinute)}>
        <strong>{formatClock(option.startMinute)}–{formatClock(option.endMinute)}</strong>
        <span>{option.whyItWorks}</span><span className="planner-muted block mt-1">{option.impact}</span>
      </button>) : <p className="planner-muted">No other start time validates with the rest of the plan held still.</p>}
      <button type="button" className="planner-button mt-3 w-full" disabled={disabled || (!placement && !locked[request.id])} onClick={() => toggleLock(request.id)}>{locked[request.id] ? "Unpin" : "Pin this time"}</button>
      <p className="planner-muted mt-2">Pinning re-solves this demo night. Sandbox changes are not saved or published.</p>
    </div>
    <details className="planner-inspector-section"><summary className="planner-link cursor-pointer">Request facts and corridor</summary>
      <dl>{explanation?.facts.map((fact) => <div className="mt-2" key={fact.label}><dt>{fact.label}</dt><dd className="planner-muted">{fact.value}</dd></div>)}</dl>
      <CorridorMap requestId={request.id} />
    </details>
  </section>;
}
