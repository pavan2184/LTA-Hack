"use client";

import { useState } from "react";
import type { PlanExport } from "@railplan/core/types/exports";
import type { PlanMetrics, Placement } from "@railplan/core/types/railplan";
import type { PlanPreview } from "@/lib/plans/workspace-types";
import { formatClock } from "@railplan/core/engine/intervals";
import { PlanNotifications } from "@/components/notifications/PlanNotifications";
import { SavedPlanExports } from "./SavedPlanExports";
import { CoordinationSummary } from "@/components/coordination/CoordinationSummary";

export function PublicationCoordinationStatus({ planId }: { planId: string }) {
  return <CoordinationSummary planId={planId} />;
}

function Metrics({ metrics }: { metrics: PlanMetrics }) {
  return <dl className="planner-metrics grid gap-3 sm:grid-cols-2">{Object.values(metrics).map((metric) => <div key={metric.key}>
    <dt className="font-medium">{metric.label}: {metric.value}{metric.unit === "percent" ? "%" : metric.unit === "minutes" ? " min" : ""}</dt>
    <dd className="planner-muted text-xs">{metric.formula} · numerator {metric.numerator}, denominator {metric.denominator}. {metric.note}</dd>
  </div>)}</dl>;
}
const slot = (placement: Placement | undefined) => placement ? `${formatClock(placement.startMinute)}–${formatClock(placement.endMinute)} · ${placement.teamId}` : "Not scheduled";

export function PreviewChanges({ snapshot, preview }: { snapshot: PlanExport; preview: PlanPreview }) {
  const before = new Map(snapshot.placements.map((p) => [p.requestId, p]));
  const after = new Map(preview.result.plan.placements.map((p) => [p.requestId, p]));
  const priorPins = new Map(snapshot.parameters.locked.map((p) => [p.requestId, p]));
  const nextPins = new Map(preview.parameters.locked.map((p) => [p.requestId, p]));
  const ids = [...new Set([...before.keys(), ...after.keys(), ...priorPins.keys(), ...nextPins.keys()])].sort();
  const changes = ids.flatMap((id) => {
    const old = before.get(id), next = after.get(id), oldPin = priorPins.get(id), nextPin = nextPins.get(id);
    const labels: string[] = [];
    if (!old && next) labels.push("Added to schedule");
    if (old && !next) labels.push("Removed from schedule");
    if (old && next && (old.startMinute !== next.startMinute || old.endMinute !== next.endMinute)) labels.push("Moved");
    if (old && next && old.teamId !== next.teamId) labels.push("Reassigned");
    if (!oldPin && nextPin) labels.push("Pinned");
    if (oldPin && !nextPin) labels.push("Unpinned");
    if (oldPin && nextPin && (oldPin.startMinute !== nextPin.startMinute || oldPin.endMinute !== nextPin.endMinute || oldPin.teamId !== nextPin.teamId)) labels.push("Pin changed");
    return labels.length ? [{ id, old, next, oldPin, nextPin, labels }] : [];
  });
  return <div className="space-y-5">
    <p className="planner-muted text-sm">Unsaved preview compared with saved version {snapshot.provenance.planId}. Saving creates a new version; publication requires a separate server check.</p>
    {preview.stale && <p role="alert">Planning inputs have changed since this version was saved. Generate a fresh version before publication.</p>}
    <p>{preview.result.status} · {changes.length} changed requests</p>
    {!changes.length ? <p>No placement or pin changes.</p> : <ul className="space-y-3">{changes.map((change) => <li className="rounded border border-rule p-3 text-sm" key={change.id}>
      <p className="font-medium">{change.id} · {snapshot.facts.requests.find((r) => r.id === change.id)?.title ?? change.id}</p>
      <p>{change.labels.join(" · ")}</p><p>Saved: {slot(change.old)}</p><p>Preview: {slot(change.next)}</p>
      {(change.oldPin || change.nextPin) && <p>Pin: {change.oldPin ? slot(change.oldPin) : "None"} → {change.nextPin ? slot(change.nextPin) : "None"}</p>}
    </li>)}</ul>}
    <section><h3 className="mb-3 font-semibold">Preview calculations</h3><Metrics metrics={preview.result.metrics} /></section>
    {preview.result.plan.deferred.length > 0 && <section><h3 className="font-semibold">Deferred work</h3><ul className="space-y-2 text-sm">{preview.result.plan.deferred.map((row) => <li key={row.requestId}>{row.requestId}: {row.reason}</li>)}</ul></section>}
    {preview.result.violations.length > 0 && <ul className="space-y-2 text-sm" aria-label="Preview violations">{preview.result.violations.map((v) => <li key={v.id}>{v.title}: {v.detail}</li>)}</ul>}
  </div>;
}

export function ObjectiveComparison({ comparisons, disabled, onChoose }: { comparisons: PlanPreview[]; disabled: boolean; onChoose: (candidate: PlanPreview) => void }) {
  return <div className="space-y-4"><p className="planner-muted text-sm">Compare objectives using the same saved facts and pins. Choose an objective to inspect an unsaved preview.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Objective preview comparison</caption><thead><tr>{["Objective", "Status", "Scheduled", "Mandatory", "Movement", "Emergency capacity", "Action"].map((label) => <th className="p-2" scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{comparisons.map((candidate) => { const metrics = candidate.result.metrics; return <tr className="border-t border-rule" key={candidate.parameters.strategy}>
        <th className="p-2 font-medium capitalize" scope="row">{candidate.parameters.strategy.replaceAll("-", " ")}</th><td className="p-2">{candidate.result.status}{candidate.stale ? " · stale" : ""}</td>
        <td className="p-2">{metrics.placed.numerator}/{metrics.placed.denominator}</td><td className="p-2">{metrics.criticalPlaced.numerator}/{metrics.criticalPlaced.denominator}</td><td className="p-2">{metrics.movement.value} min</td><td className="p-2">{metrics.emergencyCapacity.value}%</td>
        <td className="p-2"><button className="planner-button" disabled={disabled} onClick={() => onChoose(candidate)}>Preview {candidate.parameters.strategy.replaceAll("-", " ")}</button></td>
      </tr>; })}</tbody></table></div>
    {comparisons.length === 0 && <p>No objective comparisons are available.</p>}
    <p className="planner-muted text-xs">Scheduled and mandatory values show numerator/denominator. Emergency capacity is calculated by scenario insertion and validation; a higher value is not a safety approval.</p>
  </div>;
}

type VersionDetailsProps = { snapshot: PlanExport; busy: boolean; warning: string | null; onDecision: (kind: "note" | "accept" | "reject", reason: string) => Promise<void> };
export function VersionDetails(props: VersionDetailsProps) {
  return <VersionDetailsContent key={props.snapshot.provenance.planId} {...props} />;
}
function VersionDetailsContent({ snapshot, busy, warning, onDecision }: VersionDetailsProps) {
  const [kind, setKind] = useState<"note" | "accept" | "reject">("note");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function record() {
    setSaving(true); setNotice(""); setError("");
    try { await onDecision(kind, reason.trim()); setReason(""); setNotice("Decision recorded in the audit history."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The decision could not be recorded. Try again."); }
    finally { setSaving(false); }
  }
  const p = snapshot.provenance;
  return <div className="space-y-5">
    <p>{p.status} · {snapshot.assessment.publicationState} · source {snapshot.assessment.sourceFreshness}</p>
    <dl className="grid gap-3 text-sm sm:grid-cols-2">{Object.entries({ Version: p.planId, "Planning night": p.planningNight, "Source revision": p.sourceRevision, "Current source revision": snapshot.assessment.currentSourceRevision, "Input digest": p.inputDigest, Solver: p.solverVersion, Constraints: p.constraintVersion, "Created by": p.createdBy, Created: p.generatedAt, Published: snapshot.assessment.publishedAt ?? "Not published", "Superseded by": snapshot.assessment.supersededBy ?? "None" }).map(([label, value]) => <div key={label}><dt className="planner-muted">{label}</dt><dd className="break-all font-mono text-xs">{value}</dd></div>)}</dl>
    {snapshot.assessment.warnings.length > 0 && <ul className="text-sm">{snapshot.assessment.warnings.map((message) => <li key={message}>{message}</li>)}</ul>}
    <SavedPlanExports key={p.planId} planId={p.planId} disabled={busy || saving} />
    <section><h3 className="font-semibold">Independent validation</h3><p className="text-sm">{snapshot.validation.independentlyValidated ? "No critical constraint violations found in saved validation." : "Independent validation has not confirmed this version."}</p>{p.status === "INFEASIBLE" && <p>This version is infeasible. Review mandatory work without a slot and violations.</p>}<ul className="space-y-2 text-sm">{snapshot.validation.violations.map((v) => <li key={v.id}>{v.title}: {v.detail}</li>)}</ul></section>
    <details><summary className="cursor-pointer font-semibold">Saved calculations and objectives</summary><div className="mt-3"><Metrics metrics={snapshot.metrics} /><ul className="mt-3 text-sm">{snapshot.objectives.map((o) => <li key={o.label}>{o.label}: {o.value} {o.unit}</li>)}</ul></div></details>
    <PlanNotifications planId={p.planId} publishState={snapshot.assessment.publicationState} warning={warning} />
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (!busy && !saving && reason.trim()) void record(); }}>
      <h3 className="font-semibold">Record a review decision</h3><p className="planner-muted text-sm">Decisions remain in history and do not change this saved schedule.</p>
      <label className="block text-sm">Decision<select className="planner-field mt-1 block" disabled={busy || saving} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="note">Note</option><option value="accept">Accept</option><option value="reject">Reject</option></select></label>
      <label className="block text-sm">Reason<textarea className="planner-field mt-1 block min-h-20 w-full" required maxLength={1000} disabled={busy || saving} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <button className="planner-button" type="submit" disabled={busy || saving || !reason.trim()}>Record decision</button>
      {error && <p role="alert">{error}</p>}<p role="status" aria-label="Review decision status">{saving ? "Recording decision…" : notice}</p>
    </form>
  </div>;
}
