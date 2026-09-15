"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import type { PlanningInstance } from "@railplan/core/domain/instance";
import type { Plan, Violation } from "@railplan/core/types/railplan";
import { formatClock } from "@railplan/core/engine/intervals";
import { categoryOf, conflictCategories } from "@railplan/core/engine/conflicts";
import "./planner-panels.css";

export interface PlannerPanelProps {
  facts: PlanningInstance;
  plan: Plan;
  selectedRequestId: string | null;
  onSelectRequest: (id: string) => void;
}

export function PlannerQueue({ facts, plan, selectedRequestId, onSelectRequest, label = "Saved request queue", heading = true, violations = [], additionalFilters = false }: PlannerPanelProps & { label?: string; heading?: boolean; violations?: Violation[]; additionalFilters?: boolean }) {
  const [query, setQuery] = useState("");
  const [extraFilter, setExtraFilter] = useState("all");
  const [filter, setFilter] = useState<"All" | "Deferred" | "Changed">("All");
  const placements = new Map(plan.placements.map((p) => [p.requestId, p]));
  const deferred = new Set(plan.deferred.map((p) => p.requestId));
  const changed = (id: string, preferred: number) => {
    const p = placements.get(id);
    return !!p && !deferred.has(id) && p.startMinute !== preferred;
  };
  const counts = {
    All: facts.requests.length,
    Deferred: facts.requests.filter((r) => deferred.has(r.id)).length,
    Changed: facts.requests.filter((r) => changed(r.id, r.preferredStart)).length,
  };
  const visible = facts.requests.filter((r) =>
    (filter === "All" || (filter === "Deferred" ? deferred.has(r.id) : changed(r.id, r.preferredStart))) &&
    (!additionalFilters || extraFilter === "all" ||
      (extraFilter === "mandatory" ? r.mandatory :
        extraFilter === "pinned" ? placements.get(r.id)?.locked :
          extraFilter === "action" ? deferred.has(r.id) || violations.some((v) => v.requestIds.includes(r.id)) :
            violations.some((v) => v.requestIds.includes(r.id) && categoryOf(v.ruleId) === extraFilter))) &&
    [r.id, r.title, r.shortTitle, r.sector, ...r.blockIds].join(" ").toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <section className="rp-queue" aria-label={label}>
      {heading && <header className="rp-panel-heading"><h3>Request queue</h3><span className="rp-count">{facts.requests.length}</span></header>}
      <label className="rp-queue-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Search requests" placeholder="Search requests…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <div className="rp-queue-filters" aria-label="Filter requests">
        {(["All", "Deferred", "Changed"] as const).map((name) => <button key={name} type="button" aria-pressed={filter === name} onClick={() => setFilter(name)}>{name} <span>{counts[name]}</span></button>)}
      </div>
      {additionalFilters && <label className="rp-extra-filter"><span>Show</span><select aria-label="Additional request filter" className="planner-field" value={extraFilter} onChange={(event) => { setExtraFilter(event.target.value); setFilter("All"); }}>
        <option value="all">All requests</option><option value="action">Needs action</option><option value="mandatory">Mandatory</option><option value="pinned">Pinned</option>
        {conflictCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
      </select></label>}
      <ul className="rp-queue-list">
        {visible.map((r) => {
          const p = deferred.has(r.id) ? undefined : placements.get(r.id);
          const movement = p ? p.startMinute - r.preferredStart : 0;
          const line = facts.blocks.find((block) => r.blockIds.includes(block.id))?.line;
          return <li key={r.id}><button type="button" className="rp-queue-request" aria-pressed={selectedRequestId === r.id} onClick={() => onSelectRequest(r.id)}>
            <span className="rp-request-top"><span className="rp-request-id">{r.id}</span>{line && <span className={`rp-line-chip rp-line-${line.toLowerCase()}`}>{line}</span>}</span>
            <span className="rp-request-title">{r.title}</span>
            <span className="rp-request-sector">{r.sector}</span>
            <span className="rp-request-bottom"><span>{p ? `${formatClock(p.startMinute)}–${formatClock(p.endMinute)}` : deferred.has(r.id) ? "Deferred" : "Not scheduled"}</span><span>{p ? movement ? `${movement > 0 ? "+" : "−"}${Math.abs(movement)} min` : "As requested" : `${r.durationMinutes} min requested`}</span></span>
            {violations.some((v) => v.requestIds.includes(r.id)) && <span className="rp-request-conflict">Constraint conflict</span>}
            {p?.locked && <span className="rp-request-sector">Pinned</span>}
          </button></li>;
        })}
        {!visible.length && <li className="rp-queue-empty">No requests match this view.</li>}
      </ul>
      <footer className="rp-queue-footer" aria-live="polite">Showing {visible.length} of {facts.requests.length} requests</footer>
    </section>
  );
}
