"use client";

import { useMemo, useState } from "react";
import type { PlanExport } from "@railplan/core/types/exports";
import type { Placement } from "@railplan/core/types/railplan";
import { findAlternatives } from "@railplan/core/engine/alternatives";
import { formatClock } from "@railplan/core/engine/intervals";
import { previewRevision } from "@/lib/plans/revision";
import { Button } from "@/components/ui/button";

const span = (p: { startMinute: number; endMinute: number }) =>
  `${formatClock(p.startMinute)}–${formatClock(p.endMinute)}`;

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
  const preview = useMemo(() => previewRevision(snapshot, pins), [snapshot, pins]);
  const { world } = preview.context;
  const request = world.requestById[selectedRequestId ?? ""] ?? world.requests[0];
  const placement = preview.result.plan.placements.find(p => p.requestId === request?.id);
  const pinned = pins.some(p => p.requestId === request?.id);
  const choices = useMemo(() => request && !pinned
    ? findAlternatives(preview.result.plan, request.id, preview.context)
    : { alternatives: [], bindingRuleId: null }, [preview, request, pinned]);
  const choose = (startMinute: number) => {
    if (!request) return;
    setError("");
    setPins(current => [...current.filter(p => p.requestId !== request.id), {
      requestId: request.id, teamId: request.teamId, startMinute,
      endMinute: startMinute + request.durationMinutes, locked: true,
    }]);
  };
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
  return <section aria-label="Plan revision" className="space-y-4 rounded border-2 border-accent p-4">
    <h3 className="text-lg font-semibold">Review conflicts and proposed changes</h3>
    <p className="text-sm">Unsaved proposal based on this version’s approved inputs. Choosing a slot pins it and replans the night; review every change before saving a new draft.</p>
    <p role="status" aria-label="Revision assessment" className="text-sm">
      {preview.requestedViolations.length} conflicts in requested times · {preview.result.plan.placements.length} proposed placements · {preview.result.plan.deferred.length} deferred · {pins.length} pinned.
      {preview.feasible ? " Proposal passes the encoded constraints and includes mandatory work." : " No feasible proposal with these pins. Review the blockers or unpin work."}
    </p>
    <fieldset disabled={busy || saving} className="min-w-0 space-y-4 disabled:opacity-70">
      <legend className="sr-only">Revise this plan</legend>
      <label className="block text-sm font-medium">Request to review
        <select className="mt-1 block w-full rounded border border-rule-strong bg-white p-2"
          value={request?.id ?? ""} onChange={e => selectRequest(e.target.value)}>
          {!request && <option value="">No requests</option>}
          {world.requests.map(r => <option key={r.id} value={r.id}>{r.id} — {r.title}</option>)}
        </select>
      </label>
      {request && <>
        <div className="space-y-2 text-sm">
          <p>Requested start: {formatClock(request.preferredStart)} · Proposed: {placement ? span(placement) : "Deferred"} · {pinned ? "Pinned" : "Unpinned"}</p>
          <ul aria-label="Requested conflict evidence" className="space-y-2">
            {preview.requestedViolations.filter(v => v.requestIds.includes(request.id)).map(v =>
              <li key={v.id} className="border-l-4 border-signal-red pl-3">
                <p className="font-semibold">{v.ruleId}: {v.title}</p><p>{v.detail}</p>
                <p>Observed: {v.observed} · Required: {v.required}</p>
                <div className="flex flex-wrap gap-2">{v.requestIds.map(id =>
                  <Button key={id} size="sm" onClick={() => selectRequest(id)}>Review {id}</Button>)}</div>
              </li>)}
          </ul>
          {!preview.requestedViolations.some(v => v.requestIds.includes(request.id)) && <p>No conflicts found for this request at the original requested times.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {pinned ? <Button onClick={() => { setPins(current => current.filter(p => p.requestId !== request.id)); setError(""); }}>Unpin placement</Button>
            : placement && <Button onClick={() => choose(placement.startMinute)}>Pin proposed placement</Button>}
          {!pinned && <Button onClick={() => choose(request.preferredStart)}>Try requested time</Button>}
        </div>
        <div className="space-y-2 text-sm">
          <h4 className="font-semibold">Alternative slots</h4>
          {pinned ? <p>Unpin this request to compare other slots. Other pins stay fixed.</p>
            : choices.alternatives.length ? <ul className="grid gap-2 sm:grid-cols-3">
              {choices.alternatives.map(alt => <li key={alt.id} className="space-y-2 rounded border border-rule p-3">
                <p className="font-semibold">{span(alt)}</p><p>{alt.summary}</p>
                <Button size="sm" onClick={() => choose(alt.startMinute)}>Choose alternative {span(alt)}</Button>
              </li>)}
            </ul> : <p>No alternative slot passes validation with the other proposed placements held fixed.{choices.bindingRuleId ? ` Blocking rule: ${choices.bindingRuleId}.` : ""}</p>}
        </div>
      </>}
      <div className="space-y-2">
        <h4 className="font-semibold">Changes from saved version</h4>
        {!preview.changes.length ? <p className="text-sm">No placement or pin changes.</p> : <div className="overflow-x-auto">
          <table aria-label="Proposed changes" className="w-full text-left text-sm">
            <thead><tr>{["Request", "Saved", "Proposed", "Commitment"].map(h => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{preview.changes.map(({ request, before, after, reason }) => <tr key={request.id} className="border-t border-rule">
              <th scope="row" className="p-2 font-medium">{request.id}<span className="block font-normal">{request.title}</span></th>
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
      <details className="text-sm"><summary className="cursor-pointer">Deferred work ({preview.result.plan.deferred.length})</summary>
        <ul>{preview.result.plan.deferred.map(d => <li key={d.requestId}>{d.requestId}: {d.reason}</li>)}</ul>
      </details>
      <Button variant="primary" disabled={!preview.feasible || !preview.changes.length} onClick={save}>
        {saving ? "Saving revision…" : "Save as new draft"}
      </Button>
    </fieldset>
    {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
  </section>;
}
