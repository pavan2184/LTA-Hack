"use client";

import { useMemo, useState } from "react";
import type { PlanExport } from "@railplan/core/types/exports";
import type { MaintenanceRequest, Placement, Violation } from "@railplan/core/types/railplan";
import { categoryOf, headline, type ConflictCategory } from "@railplan/core/engine/conflicts";
import { formatClock } from "@railplan/core/engine/intervals";
import { ruleCatalogue } from "@railplan/core/engine/validate";
import { alternativesFor, explainFor, previewRevision, resolutionFor } from "@/lib/plans/revision";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";

const span = (p: { startMinute: number; endMinute: number }) =>
  `${formatClock(p.startMinute)}–${formatClock(p.endMinute)}`;
const rule = (id: string) => (ruleCatalogue as Record<string, { label: string }>)[id]?.label ?? id;

/** One hue per conflict category, the same classes the sandbox timeline uses. */
const categoryText: Record<ConflictCategory, string> = {
  sector: "text-cf-sector", engineer: "text-cf-engineer", compatibility: "text-cf-compatibility",
  equipment: "text-cf-equipment", sequencing: "text-cf-sequencing", window: "text-cf-window",
};

type RowState = "deferred" | "pinned" | "moved" | "clean";
type QueueFilter = "all" | "attention" | "pinned";

/**
 * The planner's decision surface for one saved version, on the approved facts.
 *
 * Three questions, in the order a planner asks them: what collided in the
 * requests as submitted and what would fix each clash; where each job ended up
 * and where else it could go; what did not fit at all. Every choice is a pin,
 * the night is re-solved around the pins, and the diff against the saved
 * version is shown before anything is saved. Nothing here writes to the server
 * until "Save as new draft".
 */
export function PlanRevisionEditor({ snapshot, selectedRequestId, selectRequest, onSave, busy }: {
  snapshot: PlanExport;
  selectedRequestId: string | null;
  selectRequest: (id: string) => void;
  onSave: (parameters: PlanExport["parameters"]) => Promise<void>;
  busy: boolean;
}) {
  const [pins, setPins] = useState<Placement[]>(snapshot.parameters.locked);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [openConflictId, setOpenConflictId] = useState<string | null>(null);

  const preview = useMemo(() => previewRevision(snapshot, pins), [snapshot, pins]);
  const { world } = preview.context;
  const { placements, deferred } = preview.result.plan;
  const request = world.requestById[selectedRequestId ?? ""] ?? world.requests[0];
  const placement = placements.find(p => p.requestId === request?.id);
  const pinned = pins.some(p => p.requestId === request?.id);

  const stateOf = (id: string): RowState => {
    if (deferred.some(d => d.requestId === id)) return "deferred";
    if (pins.some(p => p.requestId === id)) return "pinned";
    const placed = placements.find(p => p.requestId === id);
    if (placed && placed.startMinute !== world.requestById[id]?.preferredStart) return "moved";
    return "clean";
  };
  const visible = world.requests.filter(r => {
    const state = stateOf(r.id);
    return filter === "all" || (filter === "attention" && state === "deferred") || (filter === "pinned" && state === "pinned");
  });

  const explanation = useMemo(() => request ? explainFor(preview, request.id) : null, [preview, request]);
  const choices = useMemo(() => request && !pinned
    ? alternativesFor(preview, request.id)
    : { alternatives: [], bindingRuleId: null }, [preview, request, pinned]);
  const conflicts = useMemo(() => [...preview.requestedViolations]
    .sort((a, b) => b.shortfallMinutes - a.shortfallMinutes || a.id.localeCompare(b.id)), [preview]);
  const openConflict = conflicts.find(v => v.id === openConflictId) ?? null;
  // A search over every candidate start for every request in the clash, so it
  // runs for the open row only.
  const resolution = useMemo(() => openConflict ? resolutionFor(preview, openConflict) : null, [preview, openConflict]);

  const pin = (id: string, startMinute: number) => {
    const target = world.requestById[id];
    if (!target) return;
    setError("");
    setPins(current => [...current.filter(p => p.requestId !== id), {
      requestId: id, teamId: target.teamId, startMinute,
      endMinute: startMinute + target.durationMinutes, locked: true,
    }]);
  };
  const unpin = (id: string) => { setPins(current => current.filter(p => p.requestId !== id)); setError(""); };
  const save = async () => {
    setSaving(true); setError("");
    try {
      await onSave({ planningNight: snapshot.provenance.planningNight,
        basedOnPlanId: snapshot.provenance.planId,
        strategy: snapshot.parameters.strategy, locked: pins });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the revision. Your choices are still here.");
    } finally { setSaving(false); }
  };

  const panel = "min-w-0 rounded border border-rule bg-surface";
  const panelHead = "flex items-baseline justify-between gap-2 border-b border-rule px-3 py-2";
  const chip = (active: boolean) => cn("rounded-xs border px-1.5 py-0.5 text-[11px] font-medium",
    active ? "border-ink-900 bg-ink-900 text-white" : "border-rule text-ink-500 hover:border-rule-strong hover:text-ink-900");

  return <section aria-label="Plan revision" className="space-y-4 rounded border-2 border-accent p-4">
    <div>
      <h3 className="text-lg font-semibold">Review conflicts and proposed changes</h3>
      <p className="mt-1 text-sm text-ink-700">Unsaved proposal on this version’s approved inputs. Every choice below is a pin; the rest of the night is re-solved around it and re-validated. Nothing is saved until you save a new draft.</p>
    </div>
    <p role="status" aria-label="Revision assessment" className="text-sm">
      {conflicts.length} conflicts in requested times · {placements.length} proposed placements · {deferred.length} deferred · {pins.length} pinned.
      {preview.feasible ? " Proposal passes the encoded constraints and includes mandatory work." : " No feasible proposal with these pins. Review the blockers or unpin work."}
    </p>
    <fieldset disabled={busy || saving} className="min-w-0 space-y-4 disabled:opacity-70">
      <legend className="sr-only">Revise this plan</legend>

      <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        {/* Queue */}
        <section aria-label="Requests" className={panel}>
          <div className="border-b border-rule p-2.5">
            <div className="flex items-baseline justify-between">
              <h4 className="text-[13px] font-semibold">Requests</h4>
              <span className="text-[12px] text-ink-500">{visible.length} of {world.requests.length}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {([["attention", "Needs action"], ["all", "All"], ["pinned", "Pinned"]] as const).map(([id, label]) =>
                <button key={id} type="button" aria-pressed={filter === id} className={chip(filter === id)} onClick={() => setFilter(id)}>{label}</button>)}
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {!visible.length && <p className="p-3 text-[12px] text-ink-500">{filter === "attention" ? "Every request has a slot." : "No requests match."}</p>}
            {visible.map(r => <QueueRow key={r.id} request={r} state={stateOf(r.id)}
              start={placements.find(p => p.requestId === r.id)?.startMinute ?? null}
              selected={request?.id === r.id} onSelect={() => selectRequest(r.id)} />)}
          </div>
        </section>

        {/* Conflicts and unplaced work */}
        <div className="min-w-0 space-y-3">
          <section aria-label="Requested-time conflicts" className={cn(panel, "flex max-h-[560px] min-h-0 flex-col")}>
            <header className={panelHead}>
              <h4 className="text-[13px] font-semibold">Conflicts in the requested times</h4>
              <span className="text-[12px] text-ink-500">{conflicts.length} across {new Set(conflicts.flatMap(v => v.requestIds)).size} requests</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!conflicts.length && <p className="p-3 text-[13px] text-signal-green">No conflicts in the requested times.</p>}
              <ul>
                {conflicts.map(v => <ConflictRow key={v.id} violation={v} open={openConflictId === v.id}
                  onToggle={() => setOpenConflictId(openConflictId === v.id ? null : v.id)}
                  resolution={openConflictId === v.id ? resolution : null}
                  onApply={(id, start) => pin(id, start)} onReview={selectRequest} world={world} />)}
              </ul>
            </div>
          </section>

          <section aria-label="Work without a slot" className={panel}>
            <header className={panelHead}>
              <h4 className="text-[13px] font-semibold">Work without a slot</h4>
              <span className="text-[12px] text-ink-500">{deferred.length} deferred</span>
            </header>
            {!deferred.length ? <p className="p-3 text-[13px] text-signal-green">Every request has a slot in this proposal.</p>
              : <ul className="divide-y divide-rule">
                {deferred.map(d => {
                  const r = world.requestById[d.requestId];
                  return <li key={d.requestId} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-[12px]">
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900"><span className="font-mono">{d.requestId}</span> · {r?.title ?? "Unknown request"}{r?.mandatory && <Tag tone="red" className="ml-2">mandatory</Tag>}</p>
                      <p className="mt-0.5 text-ink-700">{d.reason}</p>
                    </div>
                    <Button size="sm" onClick={() => selectRequest(d.requestId)}>Review {d.requestId}</Button>
                  </li>;
                })}
              </ul>}
          </section>
        </div>

        {/* Inspector */}
        <section aria-label="Request inspector" className={cn(panel, "lg:col-span-2 xl:col-span-1")}>
          {!request ? <p className="p-3 text-[12px] text-ink-500">No requests in this version.</p> : <>
            <header className="border-b border-rule px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[12px] font-medium text-ink-700">{request.id}</span>
                <span className="flex gap-1.5">
                  {request.mandatory && <Tag tone="red">mandatory</Tag>}
                  {pinned && <Tag tone="accent">Pinned</Tag>}
                </span>
              </div>
              <h4 className="mt-0.5 text-[14px] font-semibold leading-snug">{request.title}</h4>
              <p className="mt-0.5 text-[12px] text-ink-500">{request.sector} · {request.durationMinutes} min · {world.teamById[request.teamId]?.name ?? request.teamId}</p>
            </header>
            <dl className="grid grid-cols-3 gap-px border-b border-rule bg-rule text-[12px]">
              <Cell label="Requested">{formatClock(request.preferredStart)}–{formatClock(request.preferredStart + request.durationMinutes)}</Cell>
              <Cell label="Proposed">{placement ? span(placement) : "No slot"}</Cell>
              <Cell label="Change">{placement ? (explanation?.movedMinutes ? `${Math.abs(explanation.movedMinutes)} min ${explanation.movedMinutes > 0 ? "later" : "earlier"}` : "As requested") : "Deferred"}</Cell>
            </dl>
            <section className="border-b border-rule px-3 py-2.5 text-[12px]">
              <h5 className="text-[11px] uppercase tracking-[0.06em] text-ink-500">Why this placement</h5>
              <p className="mt-1.5 leading-relaxed text-ink-900">{explanation?.summary ?? deferred.find(d => d.requestId === request.id)?.reason ?? "No explanation available."}</p>
              {explanation?.blockers.length ? <ul aria-label="At the requested time" className="mt-2 divide-y divide-rule border border-rule bg-paper">
                {explanation.blockers.map(b => <li key={b.id} className="px-2 py-1.5">
                  <span className="font-medium text-signal-red">{rule(b.ruleId)}</span>
                  <span className="text-ink-500"> — {b.observed}, needs {b.required}</span>
                </li>)}
              </ul> : null}
            </section>
            <section className="border-b border-rule px-3 py-2.5">
              <div className="flex flex-wrap gap-1.5">
                {pinned ? <Button size="sm" onClick={() => unpin(request.id)}>Unpin placement</Button>
                  : placement && <Button size="sm" onClick={() => pin(request.id, placement.startMinute)}>Pin proposed placement</Button>}
                {!pinned && <Button size="sm" onClick={() => pin(request.id, request.preferredStart)}>Try requested time</Button>}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">A pin is a hard constraint. The rest of the night is re-solved around it and every rule is re-checked.</p>
            </section>
            <section className="px-3 py-2.5 text-[12px]">
              <div className="flex items-baseline justify-between gap-2">
                <h5 className="text-[11px] uppercase tracking-[0.06em] text-ink-500">Alternative slots</h5>
                <span className="text-[11px] text-ink-400">closest to the request first</span>
              </div>
              {pinned ? <p className="mt-2 text-ink-700">Unpin this request to compare other slots. Other pins stay fixed.</p>
                : choices.alternatives.length ? <ul className="mt-2 space-y-1.5">
                  {choices.alternatives.map(alt => <li key={alt.id} className="border border-rule bg-paper px-2 py-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono font-medium text-ink-900">{span(alt)}</span>
                      <span className={cn("text-[11px]", alt.movementMinutesDelta < 0 ? "text-signal-green" : "text-ink-500")}>
                        {alt.movementMinutesDelta === 0 ? "no change in movement" : `${alt.movementMinutesDelta > 0 ? "+" : ""}${alt.movementMinutesDelta} min movement`}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-700">{alt.whyItWorks}</p>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5">
                      <span className="text-[11px] text-ink-500">{alt.impact}</span>
                      <Button size="sm" onClick={() => pin(request.id, alt.startMinute)}>Choose alternative {span(alt)}</Button>
                    </div>
                  </li>)}
                </ul>
                : <p className="mt-2 border border-rule bg-paper p-2 leading-relaxed text-ink-700">
                  No other start time validates with the rest of the proposal held still.
                  {choices.bindingRuleId ? ` Every candidate is blocked by ${rule(choices.bindingRuleId)}.` : ""}
                </p>}
            </section>
          </>}
        </section>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold">Changes from saved version</h4>
        {!preview.changes.length ? <p className="text-sm">No placement or pin changes.</p> : <div className="overflow-x-auto">
          <table aria-label="Proposed changes" className="w-full text-left text-sm">
            <thead><tr>{["Request", "Saved", "Proposed", "Commitment"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{preview.changes.map(({ request: r, before, after, reason }) => <tr key={r.id} className="border-t border-rule">
              <th scope="row" className="p-2 font-medium">{r.id}<span className="block font-normal">{r.title}</span></th>
              <td className="whitespace-nowrap p-2">{before ? span(before) : "Deferred"}</td>
              <td className="p-2">{after ? span(after) : `Deferred: ${reason}`}</td>
              <td className="p-2">{before?.locked ? "Pinned" : "Unpinned"} → {after?.locked ? "Pinned" : "Unpinned"}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
      {!preview.feasible && <div className="space-y-2 text-sm" aria-label="Revision blockers">
        {preview.mandatoryMissing.map(r => <p key={r.id}>Mandatory work has no slot: {r.id} — {r.title}.</p>)}
        {preview.result.violations.map(v => <p key={v.id}>{v.ruleId}: {v.detail}</p>)}
      </div>}
      <Button variant="primary" disabled={!preview.feasible || !preview.changes.length} onClick={save}>
        {saving ? "Saving revision…" : "Save as new draft"}
      </Button>
    </fieldset>
    {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
  </section>;
}

function QueueRow({ request, state, start, selected, onSelect }: {
  request: MaintenanceRequest; state: RowState; start: number | null; selected: boolean; onSelect: () => void;
}) {
  return <button type="button" onClick={onSelect} aria-label={`Open ${request.id}, ${request.title}`} aria-pressed={selected}
    className={cn("block w-full border-b border-l-[3px] border-b-rule px-2.5 py-2 text-left last:border-b-0",
      selected ? "bg-accent-soft" : "hover:bg-sunk",
      state === "deferred" && "border-l-signal-amber", state === "pinned" && "border-l-accent",
      state === "moved" && "border-l-rule-strong", state === "clean" && "border-l-signal-green")}>
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-mono text-[11px] font-medium text-ink-700">{request.id}</span>
      <span className={cn("text-[11px] font-medium", state === "deferred" ? "text-signal-amber" : "text-ink-500")}>
        {start !== null ? formatClock(start) : "no slot"}
      </span>
    </div>
    <p className="mt-0.5 truncate text-[13px] text-ink-900">{request.title}</p>
    <p className="mt-0.5 text-[11px] text-ink-500">
      {request.sector} · {request.durationMinutes} min · <span className={request.mandatory ? "font-medium text-signal-red" : undefined}>{request.mandatory ? "mandatory" : request.priority}</span>
      {state === "moved" && " · moved"}{state === "pinned" && " · pinned"}
    </p>
  </button>;
}

function ConflictRow({ violation, open, onToggle, resolution, onApply, onReview, world }: {
  violation: Violation; open: boolean; onToggle: () => void;
  resolution: ReturnType<typeof resolutionFor> | null;
  onApply: (requestId: string, startMinute: number) => void;
  onReview: (requestId: string) => void;
  world: RevisionWorld;
}) {
  const category = categoryOf(violation.ruleId);
  const mandatory = violation.requestIds.some(id => world.requestById[id]?.mandatory);
  return <li className="border-b border-rule last:border-b-0">
    <button type="button" onClick={onToggle} aria-expanded={open}
      className={cn("block w-full px-3 py-2 text-left", open ? "bg-accent-soft" : "hover:bg-sunk")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("text-[12px] font-medium", categoryText[category])}>{rule(violation.ruleId)}</span>
        <span className="shrink-0 font-mono text-[11px] text-ink-500">
          {violation.window ? `${formatClock(violation.window.start)}-${formatClock(violation.window.end)}` : `${violation.shortfallMinutes} min`}
        </span>
      </div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-ink-900">{headline(violation)}</p>
      <p className="mt-1 text-[11px] text-ink-500">{violation.observed} → needs {violation.required}{mandatory && " · involves mandatory work"} · <span className="font-mono">{violation.ruleId}</span></p>
    </button>
    {open && <div className="border-t border-rule bg-paper px-3 py-2 text-[12px]">
      <p className="leading-relaxed text-ink-700">{violation.detail}</p>
      {resolution ? <div className="mt-2 border border-rule bg-surface px-2.5 py-2">
        <p className="text-[11px] uppercase tracking-[0.06em] text-ink-500">Recommended resolution</p>
        <p className="mt-1 text-[13px] font-medium text-ink-900">{resolution.headline} <span className="font-normal text-ink-500">(from {formatClock(resolution.fromMinute)})</span></p>
        <p className="mt-0.5 text-ink-700">{resolution.impact}</p>
        {resolution.affectedRequestIds.length > 0 && <p className="mt-0.5 text-[11px] text-signal-amber">Knock-on: {resolution.affectedRequestIds.join(", ")}</p>}
        <div className="mt-2"><Button size="sm" variant="primary" onClick={() => onApply(resolution.requestId, resolution.toMinute)}>Apply suggestion</Button></div>
        <p className="mt-1.5 text-[11px] text-ink-500">Pins {resolution.requestId} at {formatClock(resolution.toMinute)} and re-solves the rest of the night.</p>
      </div> : <p className="mt-2 border border-rule bg-surface px-2.5 py-2 leading-relaxed text-ink-700">
        No single move clears this one: every start time for each job was tried against the requested plan and each traded this conflict for another. Choose an alternative for one of them, or leave it to the solver.
      </p>}
      <div className="mt-2 flex flex-wrap gap-1.5">{violation.requestIds.map(id =>
        <Button key={id} size="sm" onClick={() => onReview(id)}>Review {id}</Button>)}</div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">{violation.remedy}</p>
    </div>}
  </li>;
}

type RevisionWorld = ReturnType<typeof previewRevision>["context"]["world"];

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="bg-surface px-3 py-2">
    <dt className="text-[11px] text-ink-500">{label}</dt>
    <dd className="mt-0.5 font-mono text-[12px] text-ink-900">{children}</dd>
  </div>;
}
