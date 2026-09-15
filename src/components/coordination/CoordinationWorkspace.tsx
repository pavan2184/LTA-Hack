"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CoordinationActionResult,
  CoordinationCase,
  CoordinationCasePage,
  CoordinationChange,
  CoordinationProposal,
} from "@railplan/core/types/coordination";
import type { RequestCatalogue } from "@railplan/core/types/requests";
import type { PlanPreview } from "@/lib/plans/workspace-types";
import { formatClock } from "@railplan/core/engine/intervals";
import { strategyList } from "@railplan/core/engine/strategies";
import { useUnsavedChanges } from "@/lib/navigation/useUnsavedChanges";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { OrganisationConfirmations } from "./OrganisationConfirmations";

type Role = "planner" | "contractor";
type Filters = {
  planningNight: string;
  state: "" | "open" | "closed";
  ownerId: string;
  overdue: "" | "true" | "false";
  pending: "" | "true" | "false";
};
type Command = Record<string, unknown> & { action: string };

const emptyFilters: Filters = {
  planningNight: "",
  state: "",
  ownerId: "",
  overdue: "",
  pending: "",
};
const short = (id: string) => id.slice(0, 8);
const stamp = (value: string) =>
  new Date(value).toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const sgtInput = (value: string) =>
  new Date(new Date(value).getTime() + 8 * 60 * 60_000)
    .toISOString()
    .slice(0, 16);
const sgtIso = (value: string) => new Date(`${value}:00+08:00`).toISOString();

async function request<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal,
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new Error("Unable to reach RailPlan. Check your connection and try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.error?.message ?? "The coordination request failed.");
  if (!data) throw new Error("RailPlan returned an incomplete response.");
  return data as T;
}

function placement(value: CoordinationChange["before"]) {
  return value
    ? `${formatClock(value.startMinute)}–${formatClock(value.endMinute)} · ${value.teamId}`
    : "Not scheduled";
}

function ChangeCard({
  change,
  organisationName,
  planner,
}: {
  change: CoordinationChange;
  organisationName?: string;
  planner: boolean;
}) {
  return (
    <article className="rounded border border-rule bg-surface p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <p className="font-medium">{change.requestId}</p>
        <span className="capitalize">{change.kind}</span>
      </div>
      {planner && (
        <p className="planner-muted text-xs">
          {change.organisationId
            ? (organisationName ??
              `Organisation ${short(change.organisationId)}`)
            : "Operator-owned work"}
          {change.submissionRevision
            ? ` · Request revision ${change.submissionRevision}`
            : ""}
        </p>
      )}
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="planner-muted">Before</dt>
          <dd>{placement(change.before)}</dd>
          {change.beforeDeferral && (
            <dd>Deferred: {change.beforeDeferral.reason}</dd>
          )}
        </div>
        <div>
          <dt className="planner-muted">Proposal</dt>
          <dd>{placement(change.after)}</dd>
          {change.afterDeferral && (
            <dd>{planner ? `Deferred: ${change.afterDeferral.reason}` : "Deferred"}</dd>
          )}
        </div>
      </dl>
    </article>
  );
}

function ProposalState({ proposal }: { proposal: CoordinationProposal }) {
  const historical = proposal.state === "superseded" || proposal.state === "withdrawn";
  return (
    <p className={proposal.stale || historical ? "text-danger" : "planner-muted"}>
      {proposal.stale
        ? "Stale proposal — create a new revision before Apply."
        : proposal.state === "superseded"
          ? "Superseded proposal — retained for history."
          : proposal.state === "withdrawn"
            ? "Withdrawn proposal — retained for history."
            : proposal.state === "applied"
              ? "Applied proposal — the linked saved plan remains a separate immutable version."
              : "Validated proposal awaiting an explicit Apply action."}
    </p>
  );
}

export function CoordinationWorkspace({
  role,
  initialCaseId,
  initialPlanningNight,
  returnPlanId,
  returnRequestId,
}: {
  role: Role;
  initialCaseId?: string;
  initialPlanningNight?: string;
  returnPlanId?: string;
  returnRequestId?: string;
}) {
  const [filters, setFilters] = useState<Filters>({
    ...emptyFilters,
    planningNight: initialPlanningNight ?? "",
  });
  const [page, setPage] = useState<CoordinationCasePage | null>(null);
  const [selected, setSelected] = useState<CoordinationCase | null>(null);
  const [catalogue, setCatalogue] = useState<RequestCatalogue | null>(null);
  const [busy, setBusy] = useState("Loading coordination cases…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [proposalRevision, setProposalRevision] = useState<number | null>(null);
  const [revisionSource, setRevisionSource] = useState("");
  const [revisionStrategy, setRevisionStrategy] = useState("balanced");
  const [revisionPreview, setRevisionPreview] = useState<PlanPreview | null>(null);
  const [owner, setOwner] = useState("");
  const [deadline, setDeadline] = useState("");
  const [lifecycle, setLifecycle] = useState<
    "escalate" | "close" | "reopen" | "withdraw" | null
  >(null);
  const [lifecycleNote, setLifecycleNote] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const initialSelectionPending = useRef(true);
  const applyAttempt = useRef<{ signature: string; key: string } | null>(null);

  const dirtyRevision = !!selected && selected.scope === "planner" && (
    !!revisionPreview ||
    revisionSource !==
      selected.proposals.find((item) => item.revision === selected.currentRevision)
        ?.sourcePlanId ||
    revisionStrategy !==
      selected.proposals.find((item) => item.revision === selected.currentRevision)
        ?.parameters.strategy
  );
  const mayLeave = useUnsavedChanges(dirtyRevision || !!lifecycleNote.trim());

  const names = useMemo(
    () =>
      new Map(
        (catalogue?.organisations ?? []).map((organisation) => [
          organisation.id,
          organisation.name,
        ]),
      ),
    [catalogue],
  );

  const choose = useCallback((coordinationCase: CoordinationCase, force = false) => {
    if (!force && !mayLeave()) return;
    setSelected(coordinationCase);
    setProposalRevision(coordinationCase.viewedRevision);
    if (coordinationCase.scope === "planner") {
      const proposal = coordinationCase.proposals.find(
        (item) => item.revision === coordinationCase.currentRevision,
      );
      setRevisionSource(proposal?.sourcePlanId ?? "");
      setRevisionStrategy(proposal?.parameters.strategy ?? "balanced");
      setOwner(coordinationCase.ownerId);
      setDeadline(
        coordinationCase.deadline
          ? sgtInput(coordinationCase.deadline)
          : "",
      );
    }
    setRevisionPreview(null);
    setError("");
    const url = new URL(window.location.href);
    url.searchParams.set("case", coordinationCase.id);
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event("request-selection"));
  }, [mayLeave]);

  const load = useCallback(async (nextFilters: Filters) => {
    const ticket = ++epoch.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy("Loading coordination cases…");
    setError("");
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(nextFilters)) {
      if (value && (role === "planner" || key !== "ownerId")) query.set(key, value);
    }
    try {
      const [next, catalogueResponse] = await Promise.all([
        request<CoordinationCasePage>(
          `/api/coordination${query.size ? `?${query}` : ""}`,
          undefined,
          abort.signal,
        ),
        role === "planner"
          ? request<{ catalogue: RequestCatalogue }>(
              "/api/requests/catalogue",
              undefined,
              abort.signal,
            )
          : Promise.resolve(null),
      ]);
      if (ticket !== epoch.current || abort.signal.aborted) return;
      setPage(next);
      if (catalogueResponse) setCatalogue(catalogueResponse.catalogue);
      const requestedInitial = initialSelectionPending.current
        ? initialCaseId
        : undefined;
      let nextSelection =
        next.cases.find((item) => item.id === requestedInitial) ??
        next.cases.find((item) => item.id === selected?.id) ??
        next.cases[0] ??
        null;
      if (!nextSelection && requestedInitial) {
        const detail = await request<{ case: CoordinationCase }>(
          `/api/coordination/${encodeURIComponent(requestedInitial)}`,
          undefined,
          abort.signal,
        );
        nextSelection = detail.case;
        setPage({ ...next, cases: [detail.case, ...next.cases] });
      }
      initialSelectionPending.current = false;
      if (nextSelection) choose(nextSelection, true);
      else setSelected(null);
    } catch (cause) {
      if (ticket === epoch.current && !abort.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Coordination cases could not be loaded.",
        );
    } finally {
      if (ticket === epoch.current && !abort.signal.aborted) setBusy("");
    }
  }, [choose, initialCaseId, role, selected?.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(filters), 0);
    return () => {
      window.clearTimeout(timer);
      controller.current?.abort();
    };
    // Initial query is intentionally stable; later filter loads are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const selectFromHistory = () => {
      const id = new URL(window.location.href).searchParams.get("case");
      const match = page?.cases.find((item) => item.id === id);
      if (match && match.id !== selected?.id) choose(match, true);
    };
    window.addEventListener("popstate", selectFromHistory);
    return () => window.removeEventListener("popstate", selectFromHistory);
  }, [choose, page?.cases, selected?.id]);

  const mutate = async (command: Command, keepErrorLocal = false) => {
    if (!selected || busy) return;
    setBusy("Saving coordination action…");
    setError("");
    setNotice("");
    try {
      const result = await request<CoordinationActionResult>(
        `/api/coordination/${encodeURIComponent(selected.id)}/actions`,
        command,
      );
      setSelected(result.case);
      setPage((current) =>
        current
          ? {
              ...current,
              cases: current.cases.map((item) =>
                item.id === result.case.id ? result.case : item,
              ),
            }
          : current,
      );
      if (result.appliedPlanId) setSavedPlanId(result.appliedPlanId);
      setProposalRevision(result.case.viewedRevision);
      if (result.case.scope === "planner") {
        const proposal = result.case.proposals.find(
          (item) => item.revision === result.case.currentRevision,
        );
        setRevisionSource(proposal?.sourcePlanId ?? "");
        setRevisionStrategy(proposal?.parameters.strategy ?? "balanced");
      }
      setRevisionPreview(null);
      setNotice(
        result.appliedPlanId
          ? `Proposal applied as saved draft ${result.appliedPlanId}. It has not been published.`
          : "Coordination action saved.",
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The action failed.";
      if (!keepErrorLocal) setError(message);
      throw cause;
    } finally {
      setBusy("");
    }
  };

  const plannerCase = selected?.scope === "planner" ? selected : null;
  const runMutation = (command: Command) => {
    void mutate(command).catch(() => undefined);
  };
  const applyProposal = () => {
    if (!selected || !currentProposal) return;
    const signature = `${selected.id}:${selected.version}:${currentProposal.revision}`;
    if (applyAttempt.current?.signature !== signature) {
      applyAttempt.current = { signature, key: crypto.randomUUID() };
    }
    runMutation({
      action: "apply",
      expectedVersion: selected.version,
      revision: currentProposal.revision,
      idempotencyKey: applyAttempt.current.key,
    });
  };
  const displayedProposal = plannerCase?.proposals.find(
    (item) => item.revision === (proposalRevision ?? plannerCase.viewedRevision),
  );
  const currentProposal = plannerCase?.proposals.find(
    (item) => item.revision === plannerCase.currentRevision,
  );
  const canApply =
    !!plannerCase &&
    plannerCase.state === "open" &&
    currentProposal?.state === "proposed" &&
    !currentProposal.stale &&
    !busy;

  const back = new URLSearchParams();
  if (initialPlanningNight) back.set("night", initialPlanningNight);
  if (returnPlanId) back.set("plan", returnPlanId);
  if (returnRequestId) back.set("request", returnRequestId);

  return (
    <div className="space-y-5">
      {role === "planner" && back.size > 0 && (
        <Link className="workspace-back-link" href={`/plans?${back}`}>
          Back to night overview
        </Link>
      )}
      {role === "planner" && (
        <form
          className="rounded border border-rule bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (mayLeave()) void load(filters);
          }}
        >
          <h2 className="font-semibold">Case filters</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="text-sm">
              Planning night
              <input className="planner-field mt-1 w-full" type="date" value={filters.planningNight} onChange={(event) => setFilters({ ...filters, planningNight: event.target.value })} />
            </label>
            <label className="text-sm">
              Case state
              <select className="planner-field mt-1 w-full" value={filters.state} onChange={(event) => setFilters({ ...filters, state: event.target.value as Filters["state"] })}>
                <option value="">All states</option><option value="open">Open</option><option value="closed">Closed</option>
              </select>
            </label>
            <label className="text-sm">
              Owner
              <select className="planner-field mt-1 w-full" value={filters.ownerId} onChange={(event) => setFilters({ ...filters, ownerId: event.target.value })}>
                <option value="">All owners</option>
                {(page?.owners ?? []).map((item) => <option key={item.id} value={item.id}>{item.isCurrentUser ? "You" : `Planner ${short(item.id)}`}</option>)}
              </select>
            </label>
            <label className="text-sm">
              Response due
              <select className="planner-field mt-1 w-full" value={filters.overdue} onChange={(event) => setFilters({ ...filters, overdue: event.target.value as Filters["overdue"] })}>
                <option value="">All deadlines</option><option value="true">Overdue</option><option value="false">Not overdue</option>
              </select>
            </label>
            <label className="text-sm">
              Organisation response
              <select className="planner-field mt-1 w-full" value={filters.pending} onChange={(event) => setFilters({ ...filters, pending: event.target.value as Filters["pending"] })}>
                <option value="">All responses</option><option value="true">Pending or changes requested</option><option value="false">All approved</option>
              </select>
            </label>
          </div>
          <button className="planner-button mt-3" type="submit" disabled={!!busy}>Apply filters</button>
        </form>
      )}
      {error && <div role="alert" className="planner-banner error">{error}</div>}
      <p role="status" aria-live="polite" aria-label="Coordination operation status" className="planner-operation">{busy || notice}</p>
      <div className={role === "planner" ? "grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]" : "space-y-4"}>
        <section className="space-y-2" aria-label="Coordination cases">
          <h2 className="font-semibold">{role === "planner" ? "Coordination queue" : "Your coordination cases"}</h2>
          {page && page.cases.length === 0 && <p className="planner-muted">No coordination cases match this view.</p>}
          {page?.cases.map((item) => (
            <button
              type="button"
              key={item.id}
              className="w-full rounded border border-rule bg-surface p-3 text-left"
              aria-pressed={selected?.id === item.id}
              aria-label={`Open coordination case ${item.id}`}
              onClick={() => choose(item)}
            >
              <strong>Case {short(item.id)}</strong>
              <span className="planner-muted mt-1 block text-xs">{item.planningNight} · {item.state}{item.overdue ? " · Overdue" : ""}</span>
            </button>
          ))}
        </section>
        {selected && (
          <section className="space-y-5 rounded border border-rule bg-sunk p-4" aria-label="Coordination case detail">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Coordination case {short(selected.id)}</h2>
                <p className="planner-muted">{selected.planningNight} · {selected.state} · Version {selected.version}{selected.overdue ? " · Response overdue" : ""}</p>
              </div>
              {plannerCase && displayedProposal && (
                <div className="flex flex-wrap gap-2">
                  {plannerCase.proposals.map((proposal) => (
                    <button key={proposal.revision} type="button" className="planner-button" aria-pressed={displayedProposal.revision === proposal.revision} onClick={() => setProposalRevision(proposal.revision)}>Revision {proposal.revision}</button>
                  ))}
                </div>
              )}
            </header>

            {plannerCase && displayedProposal && (
              <>
                <section className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Proposal revision {displayedProposal.revision}</h3>
                      <p className="planner-muted text-sm">Server validated · {displayedProposal.result.status} · {displayedProposal.parameters.strategy}</p>
                    </div>
                    <Link className="planner-link" href={`/plans?${new URLSearchParams({ night: selected.planningNight, plan: displayedProposal.sourcePlanId, ...(plannerCase.selectedRequestIds[0] ? { request: plannerCase.selectedRequestIds[0] } : {}) })}`}>Open source plan</Link>
                  </div>
                  <ProposalState proposal={displayedProposal} />
                  {displayedProposal.appliedPlanId && <Link className="planner-link" href={`/plans?${new URLSearchParams({ night: selected.planningNight, plan: displayedProposal.appliedPlanId })}`}>Open applied saved draft</Link>}
                </section>
                <section className="space-y-3">
                  <h3 className="font-semibold">Complete proposal changes</h3>
                  {displayedProposal.changes.length === 0 ? <p>No placement or deferral changes.</p> : displayedProposal.changes.map((item) => <ChangeCard key={`${item.requestId}-${item.kind}`} change={item} organisationName={item.organisationId ? names.get(item.organisationId) : undefined} planner />)}
                </section>
                <OrganisationConfirmations coordinationCase={selected} role="planner" organisationNames={names} disabled={!!busy || displayedProposal.revision !== selected.currentRevision} onAction={(action) => mutate(action, true)} />
                <section className="space-y-3 rounded border border-rule bg-surface p-4">
                  <h3 className="font-semibold">Create proposal revision</h3>
                  <p className="planner-muted text-sm">Preview with the existing analysis service. RailPlan saves only a new immutable, server-validated proposal revision.</p>
                  <label className="block text-sm">Source plan ID<input className="planner-field mt-1 block w-full font-mono" value={revisionSource} onChange={(event) => { setRevisionSource(event.target.value); setRevisionPreview(null); }} /></label>
                  <label className="block text-sm">Planning objective<select className="planner-field mt-1 block w-full" value={revisionStrategy} onChange={(event) => { setRevisionStrategy(event.target.value); setRevisionPreview(null); }}>{strategyList.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.label}</option>)}</select></label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="planner-button" disabled={!!busy || !revisionSource} onClick={() => {
                      if (!currentProposal) return;
                      setBusy("Validating proposal preview…"); setError("");
                      void request<PlanPreview>(`/api/plans/${encodeURIComponent(revisionSource)}/analysis`, { operation: "preview", strategy: revisionStrategy, locked: currentProposal.parameters.locked })
                        .then(setRevisionPreview)
                        .catch((cause) => setError(cause instanceof Error ? cause.message : "Preview failed."))
                        .finally(() => setBusy(""));
                    }}>Preview proposal revision</button>
                    <button type="button" className="planner-button primary" disabled={!!busy || !revisionPreview || revisionPreview.stale || revisionPreview.result.status === "INFEASIBLE"} onClick={() => runMutation({ action: "revise", expectedVersion: selected.version, sourcePlanId: revisionSource, parameters: { planningNight: selected.planningNight, strategy: revisionStrategy, locked: revisionPreview!.parameters.locked } })}>Save new proposal revision</button>
                  </div>
                  {revisionPreview && <p>Preview: {revisionPreview.result.status} · {revisionPreview.result.plan.placements.length} scheduled · {revisionPreview.result.plan.deferred.length} deferred{revisionPreview.stale ? " · stale" : ""}</p>}
                </section>
                <section className="space-y-3 rounded border border-rule bg-surface p-4">
                  <h3 className="font-semibold">Case actions</h3>
                  <button type="button" className="planner-button primary" disabled={!canApply} onClick={applyProposal}>Apply proposal</button>
                  <p className="planner-muted text-xs">Apply creates a saved draft. It does not publish it, and organisation confirmation is not an Apply prerequisite.</p>
                  {savedPlanId && <Link className="planner-link" href={`/plans?${new URLSearchParams({ night: selected.planningNight, plan: savedPlanId })}`}>Open newly applied saved draft {short(savedPlanId)}</Link>}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">Owner<select className="planner-field mt-1 block w-full" value={owner} onChange={(event) => setOwner(event.target.value)}>{(page?.owners ?? []).map((item) => <option key={item.id} value={item.id}>{item.isCurrentUser ? "You" : `Planner ${short(item.id)}`}</option>)}</select></label>
                    <div className="self-end"><button type="button" className="planner-button" disabled={!!busy || !owner || owner === plannerCase.ownerId} onClick={() => runMutation({ action: "assign", expectedVersion: selected.version, ownerId: owner })}>Assign owner</button></div>
                    <label className="text-sm">Response deadline (SGT display)<input className="planner-field mt-1 block w-full" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
                    <div className="self-end"><button type="button" className="planner-button" disabled={!!busy} onClick={() => runMutation({ action: "deadline", expectedVersion: selected.version, deadline: deadline ? sgtIso(deadline) : null })}>Save deadline</button></div>
                  </div>
                  <div className="flex flex-wrap gap-2">{(["escalate", selected.state === "open" ? "close" : "reopen", "withdraw"] as const).map((action) => <button type="button" className="planner-button" key={action} disabled={!!busy || (action === "withdraw" && currentProposal?.state !== "proposed")} onClick={(event) => { opener.current = event.currentTarget; setLifecycle(action); setLifecycleNote(""); }}>{action === "escalate" ? "Escalate response" : action === "close" ? "Close case" : action === "reopen" ? "Reopen case" : "Withdraw proposal"}</button>)}</div>
                </section>
                <section className="space-y-2">
                  <h3 className="font-semibold">Audit history</h3>
                  {plannerCase.events.length === 0 && <p className="planner-muted">No actions recorded after case creation.</p>}
                  <ol className="space-y-2 text-sm">{plannerCase.events.map((event) => <li className="rounded border border-rule bg-surface p-3" key={event.id}><strong className="capitalize">{event.action.replaceAll("-", " ")}</strong> · revision {event.revision} · {stamp(event.createdAt)} SGT{event.action === "approve" && <span className="block">Approval recorded for revision {event.revision}</span>}{event.note && <span className="block planner-muted">{event.note}</span>}</li>)}</ol>
                </section>
              </>
            )}

            {selected.scope === "contractor" && (
              <>
                <p className="planner-muted">Proposal revision {selected.viewedRevision} · {selected.proposalState}</p>
                <section className="space-y-3" aria-label="Your request changes">
                  {selected.changes.map((item) => <ChangeCard key={`${item.requestId}-${item.kind}`} change={item} planner={false} />)}
                </section>
                <OrganisationConfirmations coordinationCase={selected} role="contractor" disabled={!!busy} onAction={(action) => mutate(action, true)} />
              </>
            )}
          </section>
        )}
      </div>
      <Dialog open={!!lifecycle} onOpenChange={(open) => !open && !busy && setLifecycle(null)}>
        <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }} onEscapeKeyDown={(event) => busy && event.preventDefault()}>
          <DialogTitle>{lifecycle === "escalate" ? "Escalate response" : lifecycle === "close" ? "Close case" : lifecycle === "reopen" ? "Reopen case" : "Withdraw proposal"}</DialogTitle>
          <DialogDescription>This action is appended to the coordination audit history.</DialogDescription>
          <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); if (!lifecycle || !selected || !lifecycleNote.trim()) return; void mutate({ action: lifecycle, expectedVersion: selected.version, note: lifecycleNote.trim() }).then(() => { setLifecycle(null); setLifecycleNote(""); }).catch(() => undefined); }}>
            <label className="block text-sm">Reason<textarea className="planner-field mt-1 min-h-24 w-full" maxLength={1000} required disabled={!!busy} value={lifecycleNote} onChange={(event) => setLifecycleNote(event.target.value)} /></label>
            <button className="planner-button primary" type="submit" disabled={!!busy || !lifecycleNote.trim()}>Save action</button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
