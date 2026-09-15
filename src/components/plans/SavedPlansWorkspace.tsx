"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PlanVersion } from "@railplan/core/types/plans";
import type { PlanExport } from "@railplan/core/types/exports";
import type { StrategyId } from "@railplan/core/types/railplan";
import { PLANNING_NIGHT } from "@railplan/core/data/requests";
import { formatClock } from "@railplan/core/engine/intervals";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";
import { PlanNotifications } from "@/components/notifications/PlanNotifications";
import { ContractorResponses } from "./ContractorResponses";
import { Button } from "@/components/ui/button";

import { SavedPlanExports } from "./SavedPlanExports";
import { SavedPlanReview } from "./SavedPlanReview";

const strategies: [StrategyId, string][] = [
  ["balanced", "Balanced"], ["max-completion", "Maximum completion"],
  ["min-risk", "Minimum risk"], ["min-changes", "Minimum changes"],
  ["emergency-buffer", "Emergency reserve"],
];
async function request<T>(url: string, body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { cache: "no-store", ...(body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }) }); } catch { throw new Error("Unable to reach RailPlan. Check your connection and try again."); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "The request failed. Try again.");
  if (!data) throw new Error("RailPlan returned an incomplete response. Try again.");
  return data as T;
}

export function SavedPlansWorkspace() {
  const [showSettings, setShowSettings] = useState(false);
  const [night, setNight] = useState(PLANNING_NIGHT);
  const [strategy, setStrategy] = useState<StrategyId>("balanced");
  const [plans, setPlans] = useState<PlanVersion[]>([]);
  const [selected, setSelected] = useState<PlanVersion | null>(null);
  const [busy, setBusy] = useState(true);
  const [revising, setRevising] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notificationWarning, setNotificationWarning] = useState<{ planId: string; message: string } | null>(null);
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<"note" | "accept" | "reject">("note");
  const [snapshotStatus, setSnapshotStatus] = useState<{planId: string; stale: boolean} | null>(null);
  const stale = snapshotStatus?.planId === selected?.id && snapshotStatus?.stale;
  const [refresh, setRefresh] = useState(0);
  const changingVersionBlocked = busy || revising || Boolean(reason.trim());

  useEffect(() => {
    let active = true;
    request<{ plans: PlanVersion[] }>(`/api/plans?planningNight=${encodeURIComponent(night)}`)
      .then(data => { if (active) { setPlans(data.plans); setSelected(data.plans[0] ?? null); setReason(""); setKind("note"); setLoaded(true); } })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [night, refresh]);

  async function run(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "The request failed."); }
    finally { setBusy(false); }
  }
  const open = (id: string) => run(async () => {
    const data = await request<{ plan: PlanVersion }>(`/api/plans/${id}`);
    setSelected(data.plan); setReason(""); setKind("note");
  });
  const generate = () => run(async () => {
    const { plan } = await request<{ plan: PlanVersion }>("/api/plans", { planningNight: night, strategy, locked: [] });
    setSelected(plan); setReason(""); setKind("note"); setPlans(items => [plan, ...items].slice(0, 20)); setLoaded(true);
    setNotice("Plan generated and saved. Review it before publishing.");
  });
  const saveRevision = async (parameters: PlanExport["parameters"]) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const { plan } = await request<{ plan: PlanVersion }>("/api/plans", parameters);
      setSelected(plan); setPlans(items => [plan, ...items].slice(0, 20));
      setRevising(false); setReason(""); setKind("note"); setNotificationWarning(null);
      setNotice("Revision saved as a new draft. Review the saved version before publishing.");
    } finally { setBusy(false); }
  };
  const publish = () => selected && run(async () => {
    const { plan, notificationsWarning } = await request<{ plan: PlanVersion; notificationsWarning?: string | null }>(`/api/plans/${selected.id}/publish`, {});
    setNotificationWarning(notificationsWarning ? { planId: plan.id, message: notificationsWarning } : null);
    setSelected(plan);
    setPlans(items => items.map(item => item.id === plan.id ? plan : plan.publishState === "published" && item.publishState === "published"
      ? { ...item, publishState: "superseded", supersededBy: plan.id } : item));
    setNotice(plan.publishState === "published" ? "Plan published." : "This version has already been superseded. Refresh versions to open the current plan.");
  });
  const decision = () => selected && run(async () => {
    await request(`/api/plans/${selected.id}/decisions`, { kind, reason });
    setReason(""); setKind("note"); setNotice("Decision recorded in the audit history.");
  });

  return <div className="space-y-6">
    <section className="rounded border border-rule bg-surface p-5" aria-label="Generate a saved plan">
      <details open={!selected || stale}>
        <summary className="cursor-pointer text-sm font-semibold">1 · Prepare the night · {night || 'Choose a date'}</summary>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>

          <h2 className="mt-2 text-xl font-semibold">{selected ? "Night setup" : "Build a schedule"}</h2>
          {!selected && <p className="mt-2 max-w-2xl text-sm text-ink-700">Start with approved work. RailPlan finds slots and checks conflicts; you review the result before anyone receives it.</p>}
          <Link href="/requests" className="mt-3 inline-block text-sm underline underline-offset-4">Review incoming requests first →</Link>
        </div>
        <label className="text-sm">Planning night<input type="date" value={night} disabled={changingVersionBlocked} onChange={e => {
          setNight(e.target.value); setPlans([]); setSelected(null); setLoaded(false); setBusy(true); setError(""); setNotice("");
        }} className="mt-1 block rounded border border-rule-strong bg-white p-2" /></label>
      </div>
      {stale && <p className="mt-3 text-sm font-medium text-signal-amber">Planning inputs have changed. Create a fresh draft before publishing.</p>}
      <details key={selected ? "another" : "first"} open={!selected || stale} className="mt-4 border-t border-rule pt-4">
        <summary className="cursor-pointer text-sm font-medium">{selected ? "Create another draft" : "Schedule options"}</summary>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="text-sm">Planning priority<select value={strategy} disabled={changingVersionBlocked} onChange={e => setStrategy(e.target.value as StrategyId)} className="mt-1 block rounded border border-rule-strong bg-white p-2">
            {strategies.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
          <Button variant="primary" disabled={changingVersionBlocked || !night} onClick={generate}>Generate and save plan</Button>
        </div>
        <p className="mt-2 text-xs text-ink-500">Creates a new draft from current approved work. Existing versions stay in history.</p>
      </details>
      </details>
    </section>
    {reason.trim() && <p className="text-sm" role="status">You have an unrecorded review note. Record it below or <button className="underline" onClick={() => {setReason(""); setKind("note");}}>Discard review note</button> before switching versions.</p>}
    {error && <p role="alert" className="rounded border border-signal-red bg-signal-red-soft p-3 text-sm">{error}</p>}
    <p role="status" aria-label="Plan operation status" aria-live="polite" className="text-sm">{busy ? "Working…" : notice}</p>
    <div className="space-y-6">
      <details className="rounded border border-rule p-4">
        <summary className="cursor-pointer text-sm font-medium">Version history · {plans.length} saved</summary>
        <section aria-label="Saved versions" className="mt-3">
        <h2 className="mb-3 text-lg font-semibold">Saved versions</h2>
        <p className="mb-3 text-xs text-ink-500">Latest 20 for the selected night.</p>
        {loaded && !plans.length && <p className="text-sm">No saved versions for this night.</p>}
        <Button disabled={changingVersionBlocked || !night} onClick={() => { setBusy(true); setPlans([]); setSelected(null); setLoaded(false); setError(""); setNotice(""); setRefresh(n => n + 1); }}>Refresh versions</Button>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{plans.map(plan => <li key={plan.id}>
          <button disabled={changingVersionBlocked} onClick={() => open(plan.id)} aria-label={`Open version ${plan.id}`} aria-pressed={selected?.id === plan.id}
            className="w-full rounded border border-rule-strong bg-surface p-3 text-left text-sm disabled:opacity-50 aria-pressed:border-ink-900">
            <span className="block">{plan.createdAt.replace("T", " ").slice(0, 19)} UTC</span>
            <span className="block capitalize">{plan.strategy.replaceAll("-", " ")} · {plan.publishState}</span>
          </button>
        </li>)}</ul>
      </section>
      </details>
      {loaded && !selected && <p className="rounded border border-dashed border-rule-strong p-6 text-sm">No schedule to review yet. Generate a draft above, or review incoming requests first.</p>}
      {selected && <section className="min-w-0 space-y-5" aria-label="Saved plan details">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">2 · Review and adjust</p>
            <h2 className="mt-2 text-xl font-semibold">Schedule for {selected.planningNight}</h2>
            <p className="mt-2 text-sm"><span className="font-semibold capitalize">{selected.publishState}</span> · {selected.placements.length} scheduled · {selected.deferred.length} unscheduled</p>
            <p className="mt-1 text-sm text-ink-700">Select a job on the timeline to inspect it. Use conflict review to compare other times.</p>
          </div>
          <Button disabled={busy || revising} onClick={() => document.getElementById("publication")?.focus()}>Continue to {selected.publishState === "published" ? "delivery" : "publication"} ↓</Button>
        </div>
        {revising && <p className="text-sm font-medium">Save or discard the revision preview before publishing or opening another version.</p>}
        <SavedPlanReview key={`${selected.id}:${selected.publishState}`} planId={selected.id} onSaveRevision={saveRevision} onRevisionChange={setRevising} onStatus={setSnapshotStatus} busy={busy || Boolean(reason.trim())} />
        <section id="publication" tabIndex={-1} aria-label="Publish and notify" className="space-y-4 rounded border border-rule-strong bg-surface p-5 focus:outline-2 focus:outline-offset-4 focus:outline-accent">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-500">3 · Publish and notify</p>
            <h2 className="mt-2 text-xl font-semibold">{selected.publishState === "published" ? "The schedule is published" : selected.publishState === "superseded" ? "This is an older published schedule" : "Review before publishing"}</h2>
            <p className="mt-2 text-sm">{selected.publishState === "draft" ? `${selected.placements.length} jobs will be scheduled; ${selected.deferred.length} remain unscheduled. Publishing makes this version current and sends updates to configured contractor destinations.` : "Check contractor delivery status below. Download a copy for the planning record."}</p>
          </div>
        <section><h3 className="mb-2 font-semibold">Independent validation</h3>
          <p className="text-sm">{selected.validation.independentlyValidated ? 'No critical constraint violations found.' : 'This version has critical violations and cannot be published.'}</p>
          {selected.status === 'INFEASIBLE' && <p className="text-sm">The solver reported this plan infeasible. Review deferred mandatory work and violations.</p>}
          <ul className="mt-2 space-y-2 text-sm">{selected.validation.violations.map(v => <li key={v.id}>{v.title}: {v.detail}</li>)}</ul>
        </section>
          <Button variant="primary" disabled={busy || revising || stale || selected.publishState !== "draft" || selected.status === "INFEASIBLE" || !selected.validation.independentlyValidated} onClick={publish}>Publish this version</Button>
          {revising && <p className="text-sm">Save or discard your schedule changes before publishing.</p>}
          <p className="text-xs text-ink-500">The server rechecks the current planning inputs. Failed notifications do not undo publication.</p>
        {selected.publishState === "published" && <ContractorResponses key={selected.id} planId={selected.id} />}
        <PlanNotifications planId={selected.id} publishState={selected.publishState} warning={notificationWarning?.planId === selected.id ? notificationWarning.message : null} />
        <SavedPlanExports key={selected.id} planId={selected.id} disabled={busy || revising} />
        </section>
        <details className="rounded border border-rule p-4">
          <summary className="cursor-pointer text-sm font-medium">Technical record and review notes</summary>
          <div className="mt-4 space-y-5">
        <dl className="grid gap-2 rounded border border-rule bg-surface p-3 text-xs sm:grid-cols-2">
          {[['Version', selected.id], ['Source revision', selected.sourceRevision], ['Input digest', selected.inputDigest],
            ['Solver', selected.solverVersion], ['Constraints', selected.constraintVersion], ['Created by', selected.createdBy],
            ['Created', selected.createdAt], ['Published', selected.publishedAt ?? 'Not published'], ['Superseded by', selected.supersededBy ?? 'None']].map(([label, value]) =>
            <div key={label}><dt className="text-ink-500">{label}</dt><dd className="break-all font-mono">{value}</dd></div>)}
        </dl>
        <details className="rounded border border-rule p-3"><summary className="cursor-pointer font-semibold">Calculated metrics and objectives</summary>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">{Object.values(selected.metrics).map(metric => <div key={metric.key} className="text-sm">
            <dt className="font-medium">{metric.label}: {metric.value}{metric.unit === 'percent' ? '%' : metric.unit === 'minutes' ? ' min' : ''}</dt>
            <dd className="text-xs">{metric.formula} · numerator {metric.numerator}, denominator {metric.denominator}. {metric.note}</dd>
          </div>)}</dl>
          <ul className="mt-3 border-t border-rule pt-3 text-sm">{selected.objectives.map(o => <li key={o.label}>{o.label}: {o.value} {o.unit}</li>)}</ul>
        </details>
        <div className="overflow-x-auto rounded border border-rule"><table aria-label="Saved placements" className="w-full text-left text-sm">
          <caption className="p-3 text-left font-semibold">{selected.placements.length} saved placements</caption>
          <thead><tr>{['Request', 'Team', 'Start', 'End', 'Pinned'].map(label => <th key={label} scope="col" className="border-b border-rule p-2">{label}</th>)}</tr></thead>
          <tbody>{selected.placements.map(p => <tr key={p.requestId}><td className="p-2">{p.requestId}</td><td className="p-2">{p.teamId}</td><td className="p-2">{formatClock(p.startMinute)}</td><td className="p-2">{formatClock(p.endMinute)}</td><td className="p-2">{p.locked ? 'Yes' : 'No'}</td></tr>)}</tbody>
        </table></div>
        <section><h3 className="mb-2 font-semibold">Deferred work ({selected.deferred.length})</h3>
          {!selected.deferred.length && <p className="text-sm">No deferred requests.</p>}
          <ul className="space-y-2 text-sm">{selected.deferred.map(d => <li key={d.requestId}><strong>{d.requestId}</strong>: {d.reason}</li>)}</ul>
        </section>
        <form onSubmit={e => { e.preventDefault(); void decision(); }} className="space-y-3 rounded border border-rule p-4">
          <h3 className="font-semibold">Record a review decision</h3>
          <p className="text-xs">Review decisions stay in the history and do not change the saved schedule.</p>
          <label className="block text-sm">Decision<select value={kind} disabled={busy || revising} onChange={e => setKind(e.target.value as typeof kind)} className="ml-3 rounded border bg-white p-2"><option value="note">Note</option><option value="accept">Accept</option><option value="reject">Reject</option></select></label>
          <label className="block text-sm">Reason<textarea value={reason} onChange={e => setReason(e.target.value)} disabled={busy || revising} required maxLength={1000} className="mt-1 block min-h-20 w-full rounded border bg-white p-2" /></label>
          <Button type="submit" disabled={busy || revising || !reason.trim()}>Record decision</Button>
        </form>
          </div>
        </details>
      </section>}
          <details className="border-t border-rule pt-3">
            <summary className="cursor-pointer text-sm font-medium">Contractor delivery settings</summary>
            <div className="mt-3">
              <Button aria-expanded={showSettings} onClick={() => setShowSettings(value => !value)}>{showSettings ? "Close notification settings (discard unsaved edits)" : "Notification settings"}</Button>
              {showSettings && <NotificationSettings />}
            </div>
          </details>
    </div>
  </div>;
}
