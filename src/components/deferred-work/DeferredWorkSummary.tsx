"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PlanExport } from "@railplan/core/types/exports";
import type { PlannerWorkItem, WorkItemPage } from "@railplan/core/types/deferred-work";
import { useUnsavedChanges } from "@/lib/navigation/useUnsavedChanges";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** Explicit recording is separate from both draft generation and publication. */
export function RecordDeferralAction({ planId, requestId, disabled = false, onRecorded }: {
  planId: string; requestId: string; disabled?: boolean; onRecorded?: (item: PlannerWorkItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recordedId, setRecordedId] = useState<string | null>(null);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const pending = useRef(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useUnsavedChanges(!!reason || busy);
  const close = () => {
    if (!busy && (!reason || window.confirm("Discard the unsaved deferral reason?"))) { setOpen(false); setReason(""); }
  };
  const record = async () => {
    if (!reason.trim() || pending.current) return;
    const signature = JSON.stringify({ planId, requestId, reason: reason.trim() });
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/deferred-work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, requestId, reason: reason.trim(), idempotencyKey: attempt.current.key }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message ?? "The deferral could not be recorded.");
      if (!data?.workItem?.id || data.workItem.scope !== "planner") throw new Error("The response was incomplete. Retry the same reason to recover this recording.");
      if (!mounted.current) return;
      setRecordedId(data.workItem.id); setReason(""); setOpen(false);
      onRecorded?.(data.workItem);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Unable to reach RailPlan. Retry the same reason to recover this recording.");
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  return <div className="space-y-2">
    <button ref={opener} type="button" className="planner-button" disabled={disabled || busy} onClick={() => setOpen(true)}>Record deferral</button>
    {recordedId && <p role="status">Deferral recorded. <Link className="planner-link" href={`/plans/deferred?work=${encodeURIComponent(recordedId)}`}>Open recorded work item</Link></p>}
    <Dialog open={open} onOpenChange={value => !value && close()}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }} onEscapeKeyDown={event => busy && event.preventDefault()}>
      <DialogTitle>Record deferral for {requestId}</DialogTitle><DialogDescription>Record this exact saved-plan deferral in the durable backlog. Draft alternatives do not increment history. Publication records its own outcome automatically.</DialogDescription>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void record(); }}>
        <label className="block">Deferral reason<textarea required maxLength={1000} disabled={busy} className="planner-field min-h-24 w-full" value={reason} onChange={event => setReason(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}<p role="status">{busy ? "Recording deferral…" : ""}</p><button className="planner-button primary" disabled={busy || !reason.trim()}>Confirm deferral</button>
      </form>
    </DialogContent></Dialog>
  </div>;
}

export function DeferredWorkSummary({ planId, requestId, snapshot: supplied }: { planId: string; requestId?: string; snapshot?: PlanExport }) {
  const [loaded, setLoaded] = useState<{ planId: string; snapshot: PlanExport; page: WorkItemPage } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const snapshot = supplied ?? await fetch(`/api/plans/${encodeURIComponent(planId)}/export?format=json`, { cache: "no-store", signal: abort.signal }).then(async response => { if (!response.ok) throw new Error("Saved deferrals could not be loaded."); return await response.json() as PlanExport; });
        if (!snapshot || snapshot.provenance?.planId !== planId || !Array.isArray(snapshot.deferrals)) throw new Error("Saved deferrals could not be loaded.");
        const response = await fetch(`/api/deferred-work?${new URLSearchParams({ planningNight: snapshot.provenance.planningNight })}`, { cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error("Tracked work could not be loaded.");
        const page = await response.json() as WorkItemPage;
        if (!Array.isArray(page.items) || page.items.some(item => item.scope !== "planner")) throw new Error("Tracked work could not be loaded.");
        if (!abort.signal.aborted) { setLoaded({ planId, snapshot, page }); setError(""); }
      } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Deferred work could not be loaded."); }
    })();
    return () => abort.abort();
  }, [planId, retry, supplied]);
  const current = loaded?.planId === planId ? loaded : null;
  const snapshot = supplied ?? current?.snapshot;
  const candidates = snapshot?.deferrals.filter(item => !requestId || item.requestId === requestId) ?? [];
  const href = `/plans/deferred?${new URLSearchParams({ plan: planId, ...(snapshot ? { night: snapshot.provenance.planningNight } : {}), ...(requestId ? { request: requestId } : {}) })}`;
  return <section className="rounded border border-rule bg-surface p-4 space-y-3" aria-label="Deferred work summary">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">Deferred work</h2><Link className="planner-link" href={href}>Open deferred-work backlog</Link></div>
    {error && <p role="alert">{error} <button className="planner-link" type="button" onClick={() => setRetry(value => value + 1)}>Retry deferred summary</button></p>}
    {snapshot ? <p>{candidates.length} saved deferral candidates{snapshot.assessment.stale ? " · historical source" : ""}. Draft alternatives do not increment history.</p> : !error && <p role="status">Loading saved deferrals…</p>}
    {candidates.length > 0 && <details open={!!requestId}><summary className="cursor-pointer">Review saved deferrals</summary><ul className="space-y-3 mt-3">{candidates.map(candidate => <li key={candidate.requestId} className="space-y-2"><Link className="planner-link" href={`/plans?${new URLSearchParams({ night: snapshot!.provenance.planningNight, plan: planId, request: candidate.requestId })}`}>{candidate.requestId} · {candidate.title}</Link><p className="text-sm">{candidate.reason}</p><RecordDeferralAction key={`${planId}:${candidate.requestId}`} planId={planId} requestId={candidate.requestId} onRecorded={() => setRetry(value => value + 1)} /></li>)}</ul></details>}
    {current && <div className="text-sm"><p>Tracked work for this night{current.page.nextCursor ? " (first page)" : ""}: {current.page.items.length}</p><ul>{current.page.items.map(item => <li key={item.id}><Link className="planner-link" href={`/plans/deferred?${new URLSearchParams({ work: item.id, night: current.snapshot.provenance.planningNight, plan: planId })}`}>{item.title} · {item.state}</Link></li>)}</ul>{current.page.nextCursor && <Link className="planner-link" href={href}>View more tracked work</Link>}</div>}
  </section>;
}
