"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlannerWorkItem, WorkItem, WorkItemPage } from "@railplan/core/types/deferred-work";
import type { WorkItemActionInput } from "@/lib/deferred-work/schemas";
import { useUnsavedChanges } from "@/lib/navigation/useUnsavedChanges";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DeferredWorkSummary } from "./DeferredWorkSummary";

type Filters = { planningNight: string; ownerId: string; state: string; overdue: boolean; repeated: boolean; missingDue: boolean };
type Metadata = { ownerId: string; dueDate: string; priority: PlannerWorkItem["priority"]; repeatThreshold: string };
type Action = "complete" | "cancel" | "reopen" | "escalate" | "propose-night";
const labels: Record<Action, string> = { complete: "Mark completed", cancel: "Cancel work", reopen: "Reopen work", escalate: "Escalate work", "propose-night": "Propose target night" };
const metadata = (item: WorkItem): Metadata => ({ ownerId: item.scope === "planner" ? item.ownerId ?? "" : "", dueDate: item.dueDate ?? "", priority: item.priority, repeatThreshold: String(item.repeatThreshold) });

async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal, ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "The work-item request failed.");
  if (!data) throw new Error("RailPlan returned an incomplete response.");
  return data as T;
}

export function DeferredWorkWorkspace({ role, initialWorkId, initialPlanningNight, returnPlanId, returnRequestId }: {
  role: "planner" | "contractor";
  initialWorkId?: string;
  initialPlanningNight?: string;
  returnPlanId?: string;
  returnRequestId?: string;
}) {
  const [filters, setFilters] = useState<Filters>({ planningNight: initialPlanningNight ?? "", ownerId: "", state: "", overdue: false, repeated: false, missingDue: false });
  const appliedFilters = useRef(filters);
  const [page, setPage] = useState<WorkItemPage | null>(null);
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const selectedId = useRef<string | null>(null);
  const [fields, setFields] = useState<Metadata>({ ownerId: "", dueDate: "", priority: "medium", repeatThreshold: "2" });
  const [busy, setBusy] = useState("Loading deferred work…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [targetNight, setTargetNight] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const detailHeading = useRef<HTMLHeadingElement | null>(null);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const mutationPending = useRef(false);
  const plannerItem = role === "planner" && selected?.scope === "planner" ? selected : null;
  const dirty = !!plannerItem && JSON.stringify(fields) !== JSON.stringify(metadata(plannerItem));
  const mayLeave = useUnsavedChanges(dirty || !!note || !!targetNight || busy === "Saving work item…");

  const accept = useCallback((item: WorkItem, push = false) => {
    if (item.scope !== role) throw new Error("The work-item response does not match this workspace.");
    selectedId.current = item.id;
    setSelected(item);
    setFields(metadata(item));
    const url = new URL(window.location.href);
    url.searchParams.set("work", item.id);
    if (url.href !== window.location.href) window.history[push ? "pushState" : "replaceState"](window.history.state, "", url);
    window.dispatchEvent(new Event("request-selection"));
  }, [role]);

  const readPage = useCallback(async (nextFilters: Filters, cursor?: string, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value && (role === "planner" || key !== "ownerId")) query.set(key, String(value));
    }
    if (cursor) query.set("cursor", cursor);
    const next = await request<WorkItemPage>(`/api/deferred-work${query.size ? `?${query}` : ""}`, undefined, signal);
    if (!Array.isArray(next.items) || next.items.some(item => item.scope !== role)) throw new Error("The backlog response does not match this workspace.");
    return next;
  }, [role]);

  const load = useCallback(async (nextFilters: Filters, options: { initialId?: string; refreshDetail?: boolean; cursor?: string } = {}) => {
    const ticket = ++epoch.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy("Loading deferred work…"); setError("");
    if (options.initialId && options.initialId !== selectedId.current) {
      selectedId.current = options.initialId;
      setSelected(null); setNote(""); setTargetNight(""); setAction(null); setNotice("");
    }
    try {
      const next = await readPage(nextFilters, options.cursor, abort.signal);
      if (ticket !== epoch.current || abort.signal.aborted) return;
      appliedFilters.current = { ...nextFilters };
      setPage(previous => options.cursor && previous ? { ...next, items: [...previous.items, ...next.items.filter(item => !previous.items.some(existing => existing.id === item.id))] } : next);
      const target = options.initialId ?? (options.refreshDetail ? selectedId.current : null) ?? (!selectedId.current ? next.items[0]?.id : null);
      if (target) {
        const detail = await request<{ workItem: WorkItem }>(`/api/deferred-work/${encodeURIComponent(target)}`, undefined, abort.signal);
        if (ticket === epoch.current && !abort.signal.aborted) accept(detail.workItem);
      }
    } catch (cause) {
      if (ticket === epoch.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Deferred work could not be loaded.");
    } finally {
      if (ticket === epoch.current && !abort.signal.aborted) setBusy("");
    }
  }, [accept, readPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(appliedFilters.current, { initialId: initialWorkId ?? new URL(window.location.href).searchParams.get("work") ?? undefined }), 0);
    return () => { window.clearTimeout(timer); epoch.current += 1; controller.current?.abort(); };
  }, [initialWorkId, load]);

  const openItem = async (id: string, push = true) => {
    // The shared capture-phase traversal guard already approved native pops.
    if (push && (mutationPending.current || !mayLeave())) return;
    const ticket = ++epoch.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy("Loading work item…"); setError(""); setSelected(null); setNote(""); setTargetNight(""); setAction(null);
    selectedId.current = id;
    try {
      const detail = await request<{ workItem: WorkItem }>(`/api/deferred-work/${encodeURIComponent(id)}`, undefined, abort.signal);
      if (ticket === epoch.current && !abort.signal.aborted) accept(detail.workItem, push);
    } catch (cause) {
      if (ticket === epoch.current && !abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Work item unavailable.");
    } finally { if (ticket === epoch.current && !abort.signal.aborted) setBusy(""); }
  };

  // Native traversal changes the URL without remounting this client component.
  const openRef = useRef(openItem);
  useEffect(() => { openRef.current = openItem; });
  useEffect(() => {
    const pop = () => {
      const work = new URL(window.location.href).searchParams.get("work");
      if (work && work !== selectedId.current) void openRef.current(work, false);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  const mutate = async (command: WorkItemActionInput) => {
    if (!plannerItem || mutationPending.current) return;
    mutationPending.current = true;
    const ticket = ++epoch.current;
    controller.current?.abort();
    setBusy("Saving work item…"); setError(""); setNotice("");
    try {
      const result = await request<{ workItem: WorkItem }>(`/api/deferred-work/${encodeURIComponent(plannerItem.id)}/actions`, command);
      if (ticket !== epoch.current) return;
      accept(result.workItem);
      setAction(null); setNote(""); setTargetNight("");
      setNotice(`Saved work item ${result.workItem.id}.`);
      // The mutation response is authoritative even if the list refresh fails.
      const next = await readPage(appliedFilters.current);
      if (ticket === epoch.current) setPage(next);
    } catch (cause) {
      if (ticket === epoch.current) setError(cause instanceof Error ? cause.message : "The action failed. Your edits are retained.");
    } finally {
      mutationPending.current = false;
      if (ticket === epoch.current) setBusy("");
    }
  };

  const closeDialog = () => {
    if (!busy && (!(note || targetNight) || window.confirm("Discard this unsaved action?"))) { setAction(null); setNote(""); setTargetNight(""); }
  };
  const back = new URLSearchParams();
  if (initialPlanningNight) back.set("night", initialPlanningNight);
  if (returnPlanId) back.set("plan", returnPlanId);
  if (returnRequestId) back.set("request", returnRequestId);

  return <div className="space-y-5">
    {role === "planner" && back.size > 0 && <Link className="workspace-back-link" href={`/plans?${back}`}>Back to night overview</Link>}
    {role === "planner" && returnPlanId && <DeferredWorkSummary planId={returnPlanId} requestId={returnRequestId} />}
    <form className="rounded border border-rule bg-surface p-4 space-y-3" onSubmit={event => { event.preventDefault(); if (mayLeave()) void load(filters); }}>
      <h2 className="font-semibold">Backlog filters</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>Planning night<select className="planner-field w-full" value={filters.planningNight} onChange={event => setFilters({ ...filters, planningNight: event.target.value })}><option value="">All nights</option>{initialPlanningNight && !page?.nights.some(n => n.planningNight === initialPlanningNight) && <option>{initialPlanningNight}</option>}{page?.nights.map(n => <option key={n.planningNight}>{n.planningNight}</option>)}</select></label>
        <label>Work state<select className="planner-field w-full" value={filters.state} onChange={event => setFilters({ ...filters, state: event.target.value })}><option value="">All states</option>{["open", "scheduled", "completed", "cancelled"].map(state => <option key={state}>{state}</option>)}</select></label>
        {role === "planner" && <label>Filter by owner<select className="planner-field w-full" value={filters.ownerId} onChange={event => setFilters({ ...filters, ownerId: event.target.value })}><option value="">All owners</option>{page?.owners?.map(owner => <option key={owner.id} value={owner.id}>{owner.isCurrentUser ? "You" : `Planner ${owner.id.slice(0, 8)}`}</option>)}</select></label>}
      </div>
      <div className="flex flex-wrap gap-4">{([ ["overdue", "Overdue only"], ["repeated", "Repeated deferrals only"], ["missingDue", "Missing due dates only"] ] as const).map(([key, label]) => <label key={key} className="flex gap-2 items-center"><input type="checkbox" checked={filters[key]} onChange={event => setFilters({ ...filters, [key]: event.target.checked })} />{label}</label>)}</div>
      <div className="flex gap-2"><button className="planner-button" disabled={!!busy}>Apply filters</button><button type="button" className="planner-button" disabled={!!busy} onClick={() => { if (mayLeave()) void load(appliedFilters.current, { refreshDetail: true }); }}>Reload backlog</button></div>
    </form>
    <p role="status" aria-live="polite" aria-label="Deferred work status" className="planner-operation">{busy || notice}</p>
    {error && <p role="alert" className="planner-banner error">{error} Use Reload backlog to recover.</p>}
    {page && <p className="planner-muted text-sm">Dates use Singapore time. Today: {page.today}. Counts reflect distinct effective nights.</p>}
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <section aria-label={role === "planner" ? "Deferred work queue" : "Your deferred work"} className="space-y-2">
        <h2 className="font-semibold">{role === "planner" ? "Tracked work" : "Your organisation’s backlog"}</h2>
        {page?.items.length === 0 && <p>No work items match this view.</p>}
        {page?.items.map(item => <button key={item.id} type="button" className="w-full rounded border border-rule bg-surface p-3 text-left" disabled={!!busy} aria-pressed={selected?.id === item.id} onClick={() => void openItem(item.id)}><strong>{item.title}</strong><span className="block text-sm">{item.state} · {item.deferredCount} deferred nights{item.flags.overdue ? " · Overdue" : ""}{item.flags.repeated ? " · Repeated" : ""}</span></button>)}
        {page?.nextCursor && <button type="button" className="planner-button" disabled={!!busy} onClick={() => void load(appliedFilters.current, { cursor: page.nextCursor! })}>Load more work</button>}
      </section>
      {selected && <section className="min-w-0 rounded border border-rule bg-sunk p-4 space-y-4" aria-label="Work item detail">
        <header><h2 ref={detailHeading} tabIndex={-1} className="text-xl font-semibold">{selected.title}</h2><p className="capitalize">{selected.state} · {selected.priority} priority</p><p className="text-xs break-all">Work item {selected.id}</p></header>
        <p className="planner-muted">Scheduled does not mean completed. Completion requires an explicit planner record.</p>
        <dl className="grid gap-3 sm:grid-cols-2"><div><dt>Source request</dt><dd>{selected.sourceRequestId} · {selected.sourceNight}</dd></div><div><dt>Due date</dt><dd>{selected.dueDate ?? "Needs due date"}</dd></div><div><dt>Effective deferrals</dt><dd>{selected.deferredCount} distinct nights: {selected.effectiveDeferredNights.join(", ") || "None"}</dd></div><div><dt>Proposed target night</dt><dd>{selected.proposedNight ?? "Not proposed"}</dd></div></dl>
        <div className="flex flex-wrap gap-3 text-sm">{selected.flags.overdue && <span>Overdue</span>}{selected.flags.repeated && <span>Repeated deferrals</span>}{plannerItem && selected.flags.missingOwner && <span>Needs owner</span>}{selected.flags.awaitingTargetNightReview && <span>Awaiting target-night review</span>}</div>
        {plannerItem && <>
          <div className="flex flex-wrap gap-3"><Link className="planner-link" href={`/plans?${new URLSearchParams({ night: selected.sourceNight, plan: plannerItem.sourcePlanId, request: selected.sourceRequestId })}`}>Open source plan</Link>{plannerItem.submissions?.map(submission => <Link key={submission.submissionId} className="planner-link" href={`/requests?${new URLSearchParams({ planningNight: submission.planningNight, request: submission.submissionId, plan: plannerItem.sourcePlanId, planRequest: selected.sourceRequestId })}`}>Open {submission.kind === "source" ? "source" : "carry-forward"} request</Link>)}</div>
          <form className="space-y-3" onSubmit={event => { event.preventDefault(); void mutate({ action: "update", expectedVersion: plannerItem.version, ownerId: fields.ownerId || null, dueDate: fields.dueDate || null, priority: fields.priority, repeatThreshold: Number(fields.repeatThreshold) }); }}>
            <h3 className="font-semibold">Accountability</h3><p className="text-sm planner-muted">Tracking priority, due dates and repeat thresholds are informational; they do not change safety or scheduling constraints.</p>
            <fieldset disabled={!!busy} className="grid gap-3 sm:grid-cols-2">
              <label>Work owner<select className="planner-field w-full" value={fields.ownerId} onChange={event => setFields({ ...fields, ownerId: event.target.value })}><option value="">Unassigned</option>{fields.ownerId && !page?.owners?.some(owner => owner.id === fields.ownerId) && <option value={fields.ownerId}>Existing owner (unavailable)</option>}{page?.owners?.map(owner => <option key={owner.id} value={owner.id}>{owner.isCurrentUser ? "You" : `Planner ${owner.id.slice(0, 8)}`}</option>)}</select></label>
              <label>Due date (SGT)<input type="date" min="2000-01-01" max="2100-12-31" className="planner-field w-full" value={fields.dueDate} onChange={event => setFields({ ...fields, dueDate: event.target.value })} /></label>
              <label>Tracking criticality<select className="planner-field w-full" value={fields.priority} onChange={event => setFields({ ...fields, priority: event.target.value as Metadata["priority"] })}>{["critical", "high", "medium", "low"].map(priority => <option key={priority}>{priority}</option>)}</select></label>
              <label>Repeated after nights<input type="number" required min={1} max={100} className="planner-field w-full" value={fields.repeatThreshold} onChange={event => setFields({ ...fields, repeatThreshold: event.target.value })} /></label>
            </fieldset><button className="planner-button primary" disabled={!!busy || !dirty}>Save metadata</button>
          </form>
          <div className="flex flex-wrap gap-2">{([...(selected.state === "completed" || selected.state === "cancelled" ? ["reopen"] : ["complete", "cancel", "escalate", "propose-night"])] as Action[]).map(value => <button type="button" key={value} className="planner-button" disabled={!!busy || dirty} onClick={event => { opener.current = event.currentTarget; setAction(value); }}>{labels[value]}</button>)}</div>
          <section className="space-y-2"><h3 className="font-semibold">Audit history</h3>{plannerItem.historyTruncated && <p>Showing the latest 100 events. Counts include the complete history.</p>}<ol className="space-y-2">{plannerItem.events?.map(event => <li key={event.id} className="rounded border border-rule bg-surface p-3 text-sm"><strong>{event.kind}</strong> · {event.night ?? event.createdAt.slice(0, 10)}{event.note && <p>{event.note}</p>}{event.planId && <Link className="planner-link" href={`/plans?${new URLSearchParams({ plan: event.planId, ...(event.night ? { night: event.night } : {}), ...(event.requestId ? { request: event.requestId } : {}) })}`}>Open event plan</Link>}</li>)}</ol></section>
        </>}
      </section>}
    </div>
    <Dialog open={!!action} onOpenChange={open => !open && closeDialog()}><DialogContent onCloseAutoFocus={event => { event.preventDefault(); if (opener.current?.isConnected && !opener.current.matches(":disabled")) opener.current.focus(); else detailHeading.current?.focus(); }} onEscapeKeyDown={event => busy && event.preventDefault()}>
      <DialogTitle>{action ? labels[action] : "Work action"}</DialogTitle><DialogDescription>{action === "propose-night" ? "This records a target for review. It does not create, approve or schedule a request." : "Record a reason in the immutable work-item history."}</DialogDescription>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!action || !plannerItem || !note.trim() || (action === "propose-night" && !targetNight)) return; void mutate(action === "propose-night" ? { action, expectedVersion: plannerItem.version, planningNight: targetNight, note: note.trim() } : { action, expectedVersion: plannerItem.version, note: note.trim() }); }}>
        {action === "propose-night" && <label className="block">Target night<select required disabled={!!busy} className="planner-field w-full" value={targetNight} onChange={event => setTargetNight(event.target.value)}><option value="">Choose configured night</option>{page?.nights.map(night => <option key={night.planningNight}>{night.planningNight}</option>)}</select></label>}
        <label className="block">Reason<textarea required maxLength={1000} disabled={!!busy} className="planner-field min-h-24 w-full" value={note} onChange={event => setNote(event.target.value)} /></label><button className="planner-button primary" disabled={!!busy || !note.trim() || (action === "propose-night" && !targetNight)}>Save action</button>
      </form>
    </DialogContent></Dialog>
  </div>;
}
