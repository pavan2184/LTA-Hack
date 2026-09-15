"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PlannerOverview } from "@/lib/plans/workspace-types";
import { plannerRequest } from "./workspace-http";

export function PlanHistory({ night, planId, requestId }: { night?: string; planId?: string; requestId?: string }) {
  const [overview, setOverview] = useState<PlannerOverview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    plannerRequest<{ overview: PlannerOverview }>(`/api/plans/overview${night ? `?planningNight=${encodeURIComponent(night)}` : ""}`, undefined, abort.signal)
      .then(({ overview }) => { if (!abort.signal.aborted) setOverview(overview); })
      .catch((cause) => { if (!abort.signal.aborted) setError(cause.message); })
      .finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => { abort.abort(); controller.current?.abort(); };
  }, [night, refresh]);
  const link = (path: string, selectedNight: string, id?: string) => {
    const query = new URLSearchParams({ night: selectedNight });
    if (id) query.set("plan", id);
    if (requestId) query.set("request", requestId);
    return `${path}?${query}`;
  };
  async function earlier() {
    if (busy || !overview?.nextCursor || !overview.planningNight) return;
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setBusy(true); setError("");
    try {
      const result = await plannerRequest<{ overview: PlannerOverview }>(`/api/plans/overview?planningNight=${overview.planningNight}&cursor=${encodeURIComponent(overview.nextCursor)}`, undefined, abort.signal);
      if (!abort.signal.aborted) setOverview({ ...result.overview, versions: [...overview.versions, ...result.overview.versions.filter((item) => !overview.versions.some((old) => old.id === item.id))] });
    } catch (cause) { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "History could not be loaded."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <section aria-label="Saved version history" className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
      <span>Engineering night</span>
      {overview?.nights.map((item) => <Link key={item.planningNight} className="planner-button" aria-current={overview.planningNight === item.planningNight ? "date" : undefined} href={link("/plans/history", item.planningNight)}>{item.planningNight}</Link>)}
      <button className="planner-button" disabled={busy} onClick={() => { setBusy(true); setError(""); setRefresh((value) => value + 1); }}>Refresh versions</button>
    </div>
    {busy && <p role="status">Loading version history…</p>}
    {error && <p role="alert" className="planner-banner error">{error}</p>}
    {overview?.currentPublication && <div className="workspace-card"><strong>Current publication</strong><p className="mt-2"><Link className="planner-link" href={link("/plans", overview.currentPublication.planningNight, overview.currentPublication.id)}>Open current publication · {overview.currentPublication.id.slice(0, 8)}</Link></p></div>}
    {overview?.versions.map((version) => <article key={version.id} className="workspace-card flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="text-base font-semibold capitalize">{version.publishState} · {version.id.slice(0, 8)}{version.id === planId ? " · Selected" : ""}</h2><p className="mt-1 text-ink-500">{new Date(version.createdAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })} SGT · {version.strategy} · Source {version.sourceRevision}</p></div>
      <Link className="planner-button" aria-label={`Open version ${version.id}`} href={link("/plans", version.planningNight, version.id)}>Open version →</Link>
    </article>)}
    {!busy && !error && !overview?.versions.length && <div className="workspace-card"><h2 className="text-lg font-semibold">No saved versions for this night.</h2><Link className="planner-link" href={night ? link("/plans", night) : "/plans"}>Return to night overview to generate a draft</Link></div>}
    {overview?.nextCursor && <button className="planner-button" disabled={busy} onClick={() => void earlier()}>Load earlier versions</button>}
  </section>;
}
