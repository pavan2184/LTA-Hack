"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { PlannerWorkItem } from "@railplan/core/types/deferred-work";
import type { RequestCatalogue } from "@railplan/core/types/requests";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useUnsavedChanges } from "@/lib/navigation/useUnsavedChanges";

export function CarryForwardPreparation({ item, onPrepared, disabled = false }: {
  item: Pick<PlannerWorkItem, "id" | "version" | "organisationId" | "proposedNight" | "sourceNight" | "activeNight">;
  onPrepared: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [catalogue, setCatalogue] = useState<RequestCatalogue | null>(null);
  const [target, setTarget] = useState(item.proposedNight ?? "");
  const [organisation, setOrganisation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ requestId: string; target: string } | null>(null);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const mayLeave = useUnsavedChanges(open && !saved && (!!target || !!organisation || busy));
  async function begin() {
    setOpen(true); setError(""); setBusy(true);
    try {
      const response = await fetch("/api/requests/catalogue", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.catalogue) throw new Error(data.error?.message ?? "Choices could not be loaded.");
      setCatalogue(data.catalogue);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Choices could not be loaded."); }
    finally { setBusy(false); }
  }
  async function prepare() {
    const fields = { action: "prepare-carry-forward", expectedVersion: item.version, targetNight: target, ...(!item.organisationId ? { organisationId: organisation } : {}) };
    const signature = JSON.stringify(fields);
    if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/deferred-work/${item.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, idempotencyKey: retry.current.key }) });
      const data = await response.json();
      if (!response.ok || !data.requestId) throw new Error(data.error?.message ?? "The preparation could not be confirmed. Retry with the same choices.");
      setSaved({ requestId: data.requestId, target });
      try { await onPrepared(); } catch { setError("Draft saved. The backlog refresh failed; open the linked draft to continue."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The preparation could not be confirmed. Retry with the same choices."); }
    finally { setBusy(false); }
  }
  return <>
    <button ref={opener} type="button" className="planner-button" disabled={disabled} onClick={() => void begin()}>Prepare carry-forward request</button>
    <Dialog open={open} onOpenChange={next => { if (next || (!busy && (saved || mayLeave()))) setOpen(next); }}>
      <DialogContent onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }}>
        <DialogTitle>Prepare carry-forward request</DialogTitle>
        <DialogDescription>Create a linked draft for normal intake review. Review target windows, resources and dependencies before approving it. Approval retires the earlier occurrence; publication remains a separate action.</DialogDescription>
        <p role="status">{busy ? "Preparing carry-forward…" : saved ? "Linked draft saved. Continue with request review." : "Choose the configured target and organisation."}</p>
        {error && <p role="alert" className="planner-banner error">{error}</p>}
        {saved ? <Link className="planner-link" href={`/requests?${new URLSearchParams({ request: saved.requestId, planningNight: saved.target, work: item.id })}`}>Review linked draft</Link> : <form className="space-y-3" onSubmit={event => { event.preventDefault(); void prepare(); }}>
          <label className="block">Carry-forward target night<select className="planner-field w-full" required disabled={busy} value={target} onChange={event => setTarget(event.target.value)}><option value="">Choose configured night</option>{catalogue?.nights.filter(n => n.planningNight > (item.activeNight ?? item.sourceNight)).map(n => <option key={n.planningNight}>{n.planningNight}</option>)}</select></label>
          {!item.organisationId && <label className="block">Carry-forward organisation<select className="planner-field w-full" required disabled={busy} value={organisation} onChange={event => setOrganisation(event.target.value)}><option value="">Choose contractor organisation</option>{catalogue?.organisations?.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>}
          <button className="planner-button primary" disabled={busy || !target || (!item.organisationId && !organisation)}>Create linked draft</button>
          {!catalogue && !busy && <button type="button" className="planner-button" onClick={() => void begin()}>Reload choices</button>}
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}
