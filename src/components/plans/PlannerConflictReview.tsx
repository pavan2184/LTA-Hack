"use client";
import { useEffect, useRef, useState } from "react";
import type { ConflictGroup } from "@railplan/core/engine/conflicts";
import type { Placement, StrategyId } from "@railplan/core/types/railplan";
import type { PlanAnalysis } from "@/lib/plans/workspace-types";
import { plannerRequest } from "./workspace-http";

/** Read-only requested-time review. Parent owns the guarded revision preview. */
export function PlannerConflictReview({ planId, strategy, locked, disabled, onSelectRequest, onRepair }: {
  planId: string; strategy: StrategyId; locked: Placement[]; disabled: boolean;
  onSelectRequest: (id: string) => void;
  onRepair: (violationId: string) => void;
}) {
  const [groups, setGroups] = useState<ConflictGroup[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const load = async () => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true); setError("");
    try {
      const response = await plannerRequest<PlanAnalysis>(`/api/plans/${planId}/analysis`,
        { operation: "conflicts", strategy, locked }, abort.signal);
      if (abort.signal.aborted) return;
      if (response.operation !== "conflicts") throw new Error("Unexpected conflict response.");
      setGroups(response.groups); setStale(response.stale);
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Could not load conflicts.");
    } finally { if (!abort.signal.aborted) setLoading(false); }
  };
  return <section className="planner-panel p-4 space-y-3" aria-label="Requested-time conflict review">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="planner-panel-title">Requested-time conflicts</h2>
        <p className="planner-muted">Clashes in the original requested times, with your current pins applied—not remaining violations of this draft.</p></div>
      <button className="planner-button" disabled={disabled || loading} onClick={() => void load()}>
        {loading ? "Checking conflicts…" : groups ? "Refresh conflict review" : "Review requested-time conflicts"}
      </button>
    </div>
    {error && <p role="alert">{error}</p>}
    {stale && <p role="status">Inputs changed. Open or generate a current version before previewing repairs.</p>}
    {groups && <p role="status">{groups.length} clashes · {groups.reduce((n, g) => n + g.violations.length, 0)} rule findings</p>}
    {groups?.map(group => <details key={group.id} className="border-t border-rule pt-2">
      <summary className="cursor-pointer">{group.requestIds.join(" / ")} · {group.primary.title}</summary>
      <div className="py-2 flex flex-wrap gap-2">{group.requestIds.map(id =>
        <button key={id} className="planner-link" onClick={() => onSelectRequest(id)}>Inspect {id}</button>)}</div>
      <ul className="space-y-2">{group.violations.map(v => <li key={v.id}>
        <p><strong>{v.title}</strong>: {v.detail}</p>
        <button className="planner-button mt-1" disabled={disabled || stale || loading} onClick={() => onRepair(v.id)}>
          Preview repair for {v.ruleId}
        </button>
      </li>)}</ul>
      <p className="planner-muted mt-2">A repair targets one finding. The server checks the complete schedule and shows all resulting changes before you save.</p>
    </details>)}
  </section>;
}
