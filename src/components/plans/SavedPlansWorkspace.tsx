"use client";

import { useEffect, useState } from "react";
import type { PlanVersion } from "@railplan/core/types/plans";
import type { StrategyId } from "@railplan/core/types/railplan";
import { PLANNING_NIGHT } from "@railplan/core/data/requests";
import { formatClock } from "@railplan/core/engine/intervals";
import { Button } from "@/components/ui/button";

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
  const [night, setNight] = useState(PLANNING_NIGHT);
  const [strategy, setStrategy] = useState<StrategyId>("balanced");
  const [plans, setPlans] = useState<PlanVersion[]>([]);
  const [selected, setSelected] = useState<PlanVersion | null>(null);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<"note" | "accept" | "reject">("note");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    request<{ plans: PlanVersion[] }>(`/api/plans?planningNight=${encodeURIComponent(night)}`)
      .then(data => { if (active) { setPlans(data.plans); setLoaded(true); } })
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
    setSelected(data.plan); setReason("");
  });
  const generate = () => run(async () => {
    const { plan } = await request<{ plan: PlanVersion }>("/api/plans", { planningNight: night, strategy, locked: [] });
    setSelected(plan); setPlans(items => [plan, ...items].slice(0, 20)); setLoaded(true);
    setNotice("Plan generated and saved. Review it before publishing.");
  });
  const publish = () => selected && run(async () => {
    const { plan } = await request<{ plan: PlanVersion }>(`/api/plans/${selected.id}/publish`, {});
    setSelected(plan);
    setPlans(items => items.map(item => item.id === plan.id ? plan : plan.publishState === "published" && item.publishState === "published"
      ? { ...item, publishState: "superseded", supersededBy: plan.id } : item));
    setNotice(plan.publishState === "published" ? "Plan published." : "This version has already been superseded. Refresh versions to open the current plan.");
  });
  const decision = () => selected && run(async () => {
    await request(`/api/plans/${selected.id}/decisions`, { kind, reason });
    setReason(""); setNotice("Decision recorded in the audit history.");
  });

  return <div className="space-y-6">
    <section className="rounded border border-rule bg-surface p-4" aria-label="Generate a saved plan">
      <p className="mb-4 text-sm text-ink-700">Generate from the current approved planning inputs. Each version keeps its original schedule, calculations and review history.</p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">Planning night<input type="date" value={night} disabled={busy} onChange={e => {
          setNight(e.target.value); setPlans([]); setSelected(null); setLoaded(false); setBusy(true); setError(""); setNotice("");
        }} className="mt-1 block rounded border border-rule-strong bg-white p-2" /></label>
        <label className="text-sm">Objective<select value={strategy} disabled={busy} onChange={e => setStrategy(e.target.value as StrategyId)} className="mt-1 block rounded border border-rule-strong bg-white p-2">
          {strategies.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <Button variant="primary" disabled={busy || !night} onClick={generate}>Generate and save plan</Button>
        <Button disabled={busy || !night} onClick={() => { setBusy(true); setPlans([]); setSelected(null); setLoaded(false); setError(""); setNotice(""); setRefresh(n => n + 1); }}>Refresh versions</Button>
      </div>
    </section>
    {error && <p role="alert" className="rounded border border-signal-red bg-signal-red-soft p-3 text-sm">{error}</p>}
    <p role="status" aria-live="polite" className="text-sm">{busy ? "Working…" : notice}</p>
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <section aria-label="Saved versions">
        <h2 className="mb-3 text-lg font-semibold">Saved versions</h2>
        <p className="mb-3 text-xs text-ink-500">Latest 20 for the selected night.</p>
        {loaded && !plans.length && <p className="text-sm">No saved versions for this night.</p>}
        <ul className="space-y-2">{plans.map(plan => <li key={plan.id}>
          <button disabled={busy} onClick={() => open(plan.id)} aria-label={`Open version ${plan.id}`} aria-pressed={selected?.id === plan.id}
            className="w-full rounded border border-rule-strong bg-surface p-3 text-left text-sm disabled:opacity-50 aria-pressed:border-ink-900">
            <span className="block">{plan.createdAt.replace("T", " ").slice(0, 19)} UTC</span>
            <span className="block capitalize">{plan.strategy.replaceAll("-", " ")} · {plan.publishState}</span>
          </button>
        </li>)}</ul>
      </section>
      {selected && <section className="min-w-0 space-y-5" aria-label="Saved plan details">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Plan for {selected.planningNight}</h2>
            <p className="text-sm">{selected.status} · <span className="capitalize">{selected.publishState}</span></p></div>
          <Button variant="primary" disabled={busy || selected.publishState !== "draft" || selected.status === "INFEASIBLE" || !selected.validation.independentlyValidated} onClick={publish}>Publish this version</Button>
        </div>
        <p className="text-sm">Publication records this version as the current plan. The server rechecks validation and whether its source data is still current.</p>
        <dl className="grid gap-2 rounded border border-rule bg-surface p-3 text-xs sm:grid-cols-2">
          {[['Version', selected.id], ['Source revision', selected.sourceRevision], ['Input digest', selected.inputDigest],
            ['Solver', selected.solverVersion], ['Constraints', selected.constraintVersion], ['Created by', selected.createdBy],
            ['Created', selected.createdAt], ['Published', selected.publishedAt ?? 'Not published'], ['Superseded by', selected.supersededBy ?? 'None']].map(([label, value]) =>
            <div key={label}><dt className="text-ink-500">{label}</dt><dd className="break-all font-mono">{value}</dd></div>)}
        </dl>
        <section><h3 className="mb-2 font-semibold">Independent validation</h3>
          <p className="text-sm">{selected.validation.independentlyValidated ? 'No critical constraint violations found.' : 'This version has critical violations and cannot be published.'}</p>
          {selected.status === 'INFEASIBLE' && <p className="text-sm">The solver reported this plan infeasible. Review deferred mandatory work and violations.</p>}
          <ul className="mt-2 space-y-2 text-sm">{selected.validation.violations.map(v => <li key={v.id}>{v.title}: {v.detail}</li>)}</ul>
        </section>
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
          <label className="block text-sm">Decision<select value={kind} disabled={busy} onChange={e => setKind(e.target.value as typeof kind)} className="ml-3 rounded border bg-white p-2"><option value="note">Note</option><option value="accept">Accept</option><option value="reject">Reject</option></select></label>
          <label className="block text-sm">Reason<textarea value={reason} onChange={e => setReason(e.target.value)} disabled={busy} required maxLength={1000} className="mt-1 block min-h-20 w-full rounded border bg-white p-2" /></label>
          <Button type="submit" disabled={busy || !reason.trim()}>Record decision</Button>
        </form>
      </section>}
    </div>
  </div>;
}
