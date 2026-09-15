"use client";

import Link from "next/link";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  History,
  ListFilter,
} from "lucide-react";
import type { PlanExport } from "@railplan/core/types/exports";
import type { PlanVersion } from "@railplan/core/types/plans";
import type { Placement, StrategyId } from "@railplan/core/types/railplan";
import type {
  CoordinationCase,
  CoordinationParameters,
} from "@railplan/core/types/coordination";
import { buildWorld } from "@railplan/core/domain/world";
import { formatClock } from "@railplan/core/engine/intervals";
import { strategyList } from "@railplan/core/engine/strategies";
import type {
  PlannerOverview,
  PlanAnalysis,
  PlanPreview,
  PlanSummary,
} from "@/lib/plans/workspace-types";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { useUnsavedChanges } from "@/lib/navigation/useUnsavedChanges";
import { WorkforceChart } from "@/components/schedule/WorkforceChart";
import { GeographicRailMap } from "@/components/network/GeographicRailMap";
import { Figure } from "@/components/shared/Figure";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PlannerTimeline } from "./PlannerTimeline";
import { PlannerConflictReview } from "./PlannerConflictReview";
import { PlannerQueue } from "./PlannerQueue";
import { PlannerInspector } from "./PlannerInspector";
import { PlanComparison } from "./PlanComparison";
import {
  PreviewChanges,
  ObjectiveComparison,
  VersionDetails,
  PublicationCoordinationStatus,
} from "./PlannerDialogs";
import { CoordinationSummary } from "@/components/coordination/CoordinationSummary";
import { DeferredWorkSummary } from "@/components/deferred-work/DeferredWorkSummary";
import { plannerRequest } from "./workspace-http";
import "./planner-workspace.css";

type Modal =
  | "history"
  | "objectives"
  | "compare"
  | "publish"
  | "details"
  | "queue"
  | "inspector"
  | "changes"
  | null;
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
const title = (version: PlanSummary) =>
  `${version.publishState === "draft" ? "Draft" : version.publishState === "published" ? "Published" : "Superseded"} · ${short(version.id)}`;

export function SavedPlansWorkspace({
  accountControl,
}: {
  accountControl?: ReactNode;
}) {
  const [overview, setOverview] = useState<PlannerOverview | null>(null);
  const [snapshot, setSnapshot] = useState<PlanExport | null>(null);
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [selectedRequestId, setSelection] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<StrategyId>("balanced");
  const [busy, setBusy] = useState("Loading night overview…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [tab, setTab] = useState("Workforce");
  const [comparisons, setComparisons] = useState<PlanPreview[]>([]);
  const [comparisonBase, setComparisonBase] = useState<PlanExport | null>(null);
  const [notificationWarning, setNotificationWarning] = useState<string | null>(
    null,
  );
  const controller = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const dirty = useRef(false);
  const busyRef = useRef(true);
  const currentUrl = useRef("");
  const currentHistoryState = useRef<unknown>(null);
  useUnsavedChanges(!!preview);
  const opener = useRef<HTMLElement | null>(null);
  const [recoveryTarget, setRecoveryTarget] = useState<{
    night: string;
    id: string;
  } | null>(null);
  const [coordinationTarget, setCoordinationTarget] = useState<{
    id: string;
    href: string;
  } | null>(null);
  const coordinationCreation = useRef<{
    signature: string;
    key: string;
  } | null>(null);
  const updatePreview = (value: PlanPreview | null) => {
    dirty.current = !!value;
    setPreview(value);
  };
  const syncUrl = useCallback(
    (
      night: string | null,
      planId: string | null,
      requestId?: string | null,
    ) => {
      const url = new URL(window.location.href);
      for (const [key, value] of [
        ["night", night],
        ["plan", planId],
        ["request", requestId ?? null],
      ]) {
        if (value) url.searchParams.set(key!, value);
        else url.searchParams.delete(key!);
      }
      window.history.replaceState(null, "", url);
      currentUrl.current = url.toString();
      currentHistoryState.current = window.history.state;
      window.dispatchEvent(new Event("request-selection"));
    },
    [],
  );
  const load = useCallback(
    async (
      night?: string | null,
      planId?: string | null,
      requestId?: string | null,
      operation?: { signal: AbortSignal; current: () => boolean },
    ) => {
      const ticket = operation ? epoch.current : ++epoch.current;
      const abort = operation ? null : new AbortController();
      if (abort) {
        controller.current?.abort();
        controller.current = abort;
        busyRef.current = true;
        setBusy("Loading night overview…");
        setError("");
      }
      const signal = operation?.signal ?? abort!.signal;
      const current =
        operation?.current ??
        (() => ticket === epoch.current && !signal.aborted);
      try {
        const { overview: next } = await plannerRequest<{
          overview: PlannerOverview;
        }>(
          `/api/plans/overview${night ? `?planningNight=${encodeURIComponent(night)}` : ""}`,
          undefined,
          signal,
        );
        const id =
          planId || next.currentPublication?.id || next.versions[0]?.id;
        const saved = id
          ? await plannerRequest<PlanExport>(
              `/api/plans/${encodeURIComponent(id)}/export?format=json`,
              undefined,
              signal,
            )
          : null;
        if (saved && saved.provenance.planningNight !== next.planningNight)
          throw new Error(
            "This version belongs to another night. Open it from that night's history.",
          );
        if (!current()) return;
        setOverview(next);
        setSnapshot(saved);
        setNotificationWarning(null);
        setStrategy(saved?.parameters.strategy ?? "balanced");
        const chosen = saved?.facts.requests.some((r) => r.id === requestId)
          ? requestId!
          : (saved?.placements[0]?.requestId ??
            saved?.facts.requests[0]?.id ??
            null);
        setSelection(chosen);
        syncUrl(next.planningNight, saved?.provenance.planId ?? null, chosen);
        setRecoveryTarget(null);
        return saved;
      } catch (e) {
        if (current())
          setError(
            e instanceof Error ? e.message : "Could not load this night.",
          );
      } finally {
        if (!operation && current()) {
          setBusy("");
          busyRef.current = false;
        }
      }
    },
    [syncUrl],
  );
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    currentUrl.current = window.location.href;
    currentHistoryState.current = window.history.state;
    // load updates React state only after its network await, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(params.get("night"), params.get("plan"), params.get("request"));
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current || busyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const beforeLeave = (event: Event) => {
      if (busyRef.current) event.preventDefault();
    };
    const pop = (event: PopStateEvent) => {
      if (
        busyRef.current
      ) {
        event.stopImmediatePropagation();
        window.history.pushState(currentHistoryState.current, "", currentUrl.current);
        return;
      }
      dirty.current = false;
      setPreview(null);
      if (window.location.pathname !== "/plans") return;
      const p = new URLSearchParams(window.location.search);
      void load(p.get("night"), p.get("plan"), p.get("request"));
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("workspace-before-leave", beforeLeave);
    window.addEventListener("popstate", pop);
    return () => {
      controller.current?.abort();
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("workspace-before-leave", beforeLeave);
      window.removeEventListener("popstate", pop);
    };
  }, [load]);
  const openModal = (value: Modal) => {
    if (busyRef.current) return;
    opener.current = document.activeElement as HTMLElement | null;
    setModal(value);
  };
  const discardForNavigation = () =>
    !dirty.current ||
    window.confirm("Discard the unsaved preview and leave this version?");
  const selectRequest = (id: string) => {
    setSelection(id);
    syncUrl(
      overview?.planningNight ?? null,
      snapshot?.provenance.planId ?? null,
      id,
    );
  };
  const changeVersion = (night: string | null, id?: string) => {
    if (busyRef.current) return;
    if (!discardForNavigation()) return;
    setRecoveryTarget(null);
    updatePreview(null);
    setSnapshot(null);
    setOverview(null);
    setModal(null);
    setNotice("");
    setError("");
    setBusy("Loading night overview…");
    busyRef.current = true;
    void load(night, id, selectedRequestId);
  };
  const run = async (
    label: string,
    work: (operation: {
      signal: AbortSignal;
      current: () => boolean;
    }) => Promise<void>,
  ) => {
    if (busyRef.current) return;
    const ticket = ++epoch.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const current = () => ticket === epoch.current && !abort.signal.aborted;
    setBusy(label);
    busyRef.current = true;
    setError("");
    setNotice("");
    try {
      await work({ signal: abort.signal, current });
    } catch (e) {
      if (current())
        setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      if (current()) {
        setBusy("");
        busyRef.current = false;
      }
    }
  };
  const analyse = (nextStrategy: StrategyId, locked: Placement[]) =>
    snapshot &&
    run("Validating a revised preview…", async (operation) => {
      const result = await plannerRequest<PlanAnalysis>(
        `/api/plans/${snapshot.provenance.planId}/analysis`,
        { operation: "preview", strategy: nextStrategy, locked },
        operation.signal,
      );
      if (!operation.current()) return;
      if (result.operation !== "preview")
        throw new Error("Unexpected preview response.");
      updatePreview(result);
      setStrategy(nextStrategy);
      setNotice(
        "Unsaved preview. Review the changes, then generate a revised draft.",
      );
    });
  const pins = preview?.parameters.locked ?? snapshot?.parameters.locked ?? [];
  const pin = (placement: Placement) => {
    void analyse(strategy, [
      ...pins.filter((p) => p.requestId !== placement.requestId),
      {
        requestId: placement.requestId,
        teamId: placement.teamId,
        startMinute: placement.startMinute,
        endMinute: placement.endMinute,
        locked: true,
      },
    ]);
  };
  const unpin = (id: string) => {
    void analyse(
      strategy,
      pins.filter((p) => p.requestId !== id),
    );
  };
  const repair = (violationId: string) => snapshot &&
    run("Checking the recommended repair…", async operation => {
      const proposal = await plannerRequest<PlanAnalysis>(
        `/api/plans/${snapshot.provenance.planId}/analysis`,
        { operation: "repair", strategy, locked: pins, violationId }, operation.signal);
      if (!operation.current()) return;
      if (proposal.operation !== "preview") throw new Error("Unexpected repair response.");
      updatePreview(proposal);
      setStrategy(proposal.parameters.strategy);
      opener.current = document.activeElement as HTMLElement | null;
      setModal("changes");
      setNotice("Repair preview only. Review all changes before generating a revised draft.");
    });
  const createCoordination = async (
    requestId: string,
    parameters: CoordinationParameters,
  ) => {
    if (!snapshot || busyRef.current)
      throw new Error("Wait for the current operation to finish.");
    const sourcePlanId = snapshot.provenance.planId;
    const signature = JSON.stringify({ sourcePlanId, requestId, parameters });
    if (coordinationCreation.current?.signature !== signature) {
      coordinationCreation.current = {
        signature,
        key: crypto.randomUUID(),
      };
    }
    const idempotencyKey = coordinationCreation.current.key;
    await run("Creating coordination case…", async (operation) => {
      const response = await plannerRequest<{ case: CoordinationCase }>(
        "/api/coordination",
        {
          sourcePlanId,
          selectedRequestIds: [requestId],
          idempotencyKey,
          parameters,
        },
        operation.signal,
      );
      if (!operation.current()) return;
      const query = new URLSearchParams({
        case: response.case.id,
        night: snapshot.provenance.planningNight,
        plan: sourcePlanId,
        request: requestId,
      });
      setCoordinationTarget({
        id: response.case.id,
        href: `/plans/coordination?${query}`,
      });
      setNotice(
        `Coordination case ${response.case.id} created. The proposal has not been applied or published.`,
      );
    });
  };
  const stale =
    !!snapshot &&
    (snapshot.assessment.stale ||
      snapshot.provenance.sourceRevision !== overview?.sourceRevision ||
      !!preview?.stale);
  const engineMismatch = !!snapshot && !snapshot.assessment.engineVersionMatch;
  const plan = useMemo(
    () =>
      preview?.result.plan ??
      (snapshot
        ? { placements: snapshot.placements, deferred: snapshot.deferrals }
        : null),
    [preview, snapshot],
  );
  const context = useMemo(
    () => (snapshot ? { world: buildWorld(snapshot.facts) } : null),
    [snapshot],
  );
  const metrics = preview?.result.metrics ?? snapshot?.metrics;
  const violations =
    preview?.result.violations ?? snapshot?.validation.violations ?? [];
  const criticalCount = violations.filter(
    (v) => v.severity === "critical",
  ).length;
  const mandatory = snapshot?.facts.requests.filter((r) => r.mandatory) ?? [];
  const mandatoryPlaced = mandatory.filter((r) =>
    plan?.placements.some((p) => p.requestId === r.id),
  ).length;
  const validated =
    !!snapshot &&
    (preview
      ? preview.result.independentlyValidated
      : snapshot.validation.independentlyValidated) &&
    !criticalCount &&
    mandatoryPlaced === mandatory.length;
  const canPublish =
    !!snapshot &&
    !preview &&
    !stale &&
    !engineMismatch &&
    validated &&
    snapshot.provenance.status !== "INFEASIBLE" &&
    snapshot.assessment.publicationState === "draft";
  const generate = () =>
    overview?.planningNight &&
    run("Generating and saving a draft…", async (operation) => {
      if (preview && (stale || engineMismatch))
        throw new Error(
          "This preview is stale. Discard it and generate from current inputs.",
        );
      const { plan: saved } = await plannerRequest<{ plan: PlanVersion }>(
        "/api/plans",
        {
          planningNight: overview.planningNight,
          strategy,
          locked: stale || engineMismatch ? [] : pins,
          ...(preview ? { expectedBasis: preview.basis } : {}),
        },
        operation.signal,
      );
      if (!operation.current()) return;
      setRecoveryTarget({ night: saved.planningNight, id: saved.id });
      syncUrl(saved.planningNight, saved.id, selectedRequestId);
      updatePreview(null);
      setSnapshot(null);
      const refreshed = await load(
        saved.planningNight,
        saved.id,
        selectedRequestId,
        operation,
      );
      if (!operation.current()) return;
      setNotice(
        refreshed
          ? `Plan generated and saved (${saved.id}). Review it before publishing.`
          : `Plan generated and saved (${saved.id}), but its display could not be refreshed. Refresh status to open this saved version; do not generate it again.`,
      );
    });
  const publish = () =>
    snapshot &&
    canPublish &&
    run(
      "Publishing this version and checking notification delivery…",
      async (operation) => {
        const id = snapshot.provenance.planId;
        let response: {
          plan: PlanVersion;
          notificationsWarning?: string | null;
        };
        try {
          response = await plannerRequest<{
            plan: PlanVersion;
            notificationsWarning?: string | null;
          }>(`/api/plans/${id}/publish`, {}, operation.signal);
        } catch (e) {
          if (!operation.current()) return;
          setRecoveryTarget({
            night: snapshot.provenance.planningNight,
            id,
          });
          const refreshed = await load(
            snapshot.provenance.planningNight,
            id,
            selectedRequestId,
            operation,
          );
          if (!operation.current()) return;
          if (!refreshed) setSnapshot(null);
          setError(
            `${e instanceof Error ? e.message : "Publication response was interrupted."} ${refreshed ? `Status has been refreshed for ${id}; check the version before retrying.` : `Publication status for ${id} could not be refreshed. Its outcome is unconfirmed; refresh status before retrying.`}`,
          );
          return;
        }
        if (!operation.current()) return;
        setRecoveryTarget({
          night: snapshot.provenance.planningNight,
          id,
        });
        setSnapshot(null);
        const refreshed = await load(
          snapshot.provenance.planningNight,
          id,
          selectedRequestId,
          operation,
        );
        if (!operation.current()) return;
        setNotificationWarning(response.notificationsWarning ?? null);
        setModal("details");
        const outcome =
          response.plan.publishState === "published"
            ? `Plan published (${id}). Notification delivery is shown separately.`
            : `Version ${id} has already been superseded. Open the current publication from history.`;
        setNotice(
          refreshed
            ? outcome
            : `${outcome} The display could not be refreshed; refresh status to inspect this version.${response.notificationsWarning ? ` ${response.notificationsWarning}` : ""}`,
        );
      },
    );
  const compareObjectives = () =>
    snapshot &&
    run(
      "Comparing all five objectives against the same facts and pins…",
      async (operation) => {
        const data = await plannerRequest<PlanAnalysis>(
          `/api/plans/${snapshot.provenance.planId}/analysis`,
          { operation: "compare-objectives", locked: pins },
          operation.signal,
        );
        if (!operation.current()) return;
        if (data.operation !== "compare-objectives")
          throw new Error("Unexpected comparison response.");
        setComparisons(data.comparisons);
        opener.current = document.activeElement as HTMLElement | null;
        setModal("objectives");
      },
    );
  const loadComparison = (id: string) =>
    run("Loading comparison version…", async (operation) => {
      setComparisonBase(null);
      const saved = await plannerRequest<PlanExport>(
        `/api/plans/${id}/export?format=json`,
        undefined,
        operation.signal,
      );
      if (operation.current()) setComparisonBase(saved);
    });
  const compareVersions = () => {
    if (busyRef.current) return;
    const base =
      overview?.currentPublication &&
      overview.currentPublication.id !== snapshot?.provenance.planId
        ? overview?.currentPublication
        : overview?.versions.find((p) => p.id !== snapshot?.provenance.planId);
    openModal("compare");
    setComparisonBase(null);
    if (base) void loadComparison(base.id);
  };
  const loadMore = () =>
    overview?.nextCursor &&
    run("Loading earlier versions…", async (operation) => {
      const { overview: next } = await plannerRequest<{
        overview: PlannerOverview;
      }>(
        `/api/plans/overview?planningNight=${overview.planningNight}&cursor=${encodeURIComponent(overview.nextCursor!)}`,
        undefined,
        operation.signal,
      );
      if (!operation.current()) return;
      setOverview({
        ...next,
        versions: [
          ...overview.versions,
          ...next.versions.filter(
            (p) => !overview.versions.some((v) => v.id === p.id),
          ),
        ],
      });
    });
  const refreshStatus = () => {
    if (busyRef.current || !discardForNavigation()) return;
    updatePreview(null);
    const target = recoveryTarget;
    void load(
      target?.night ?? overview?.planningNight,
      target?.id ?? snapshot?.provenance.planId,
      selectedRequestId,
    );
  };
  const inspector = snapshot && plan && (
    <PlannerInspector
      snapshot={snapshot}
      plan={plan}
      preview={preview}
      selectedRequestId={selectedRequestId}
      disabled={!!busy || stale || engineMismatch}
      onPin={pin}
      onUnpin={unpin}
      onSelectRequest={selectRequest}
      onCoordinate={createCoordination}
    />
  );
  const queue = snapshot && plan && (
    <PlannerQueue
      facts={snapshot.facts}
      plan={plan}
      selectedRequestId={selectedRequestId}
      onSelectRequest={selectRequest}
    />
  );
  const versions = overview
    ? [overview.currentPublication, ...overview.versions]
        .filter((p): p is PlanSummary => !!p)
        .filter((p, i, all) => all.findIndex((v) => v.id === p.id) === i)
    : [];
  const modalTitle = {
    history: "Plan history",
    objectives: "Compare objectives",
    compare: "Compare saved versions",
    publish: "Review publication",
    details: "Saved version details",
    queue: "Work requests",
    inspector: "Request details",
    changes: "Unsaved preview changes",
  };
  return (
    <div
      className="planner-shell"
      onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        if (
          anchor &&
          busyRef.current &&
          !anchor.getAttribute("href")?.startsWith("#")
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }}
    >
      <WorkspaceNavigation role="planner" current="plans" planningNight={overview?.planningNight} planId={snapshot?.provenance.planId} requestId={selectedRequestId} accountControl={accountControl} />
      <main id="workspace" tabIndex={-1} className="planner-main">
        <div className="planner-heading">
          <div>
            <h1>Plan the engineering night</h1>
            <p>Schedule approved work, check conflicts and workforce, then review and publish a validated plan.</p>
            <p>
              {overview?.planningNight ?? "Night overview"}
              {snapshot
                ? ` · ${formatClock(snapshot.facts.window.startMinute)}–${formatClock(snapshot.facts.window.endMinute)} SGT`
                : " · Approved planning inputs"}
            </p>
          </div>
          <div className="planner-actions">
            {overview?.planningNight && <Link className="planner-button primary" href={`/requests?${new URLSearchParams({ request: "new", planningNight: overview.planningNight, ...(snapshot ? { plan: snapshot.provenance.planId } : {}), ...(selectedRequestId ? { planRequest: selectedRequestId } : {}) })}`}>Add request</Link>}
            <button className="planner-button" onClick={() => openModal("history")} disabled={!!busy}>
              <History size={14} /> Switch version
            </button>
            <label className="sr-only" htmlFor="planning-night">
              Planning night
            </label>
            <select
              id="planning-night"
              className="planner-field"
              value={overview?.planningNight ?? ""}
              disabled={!!busy}
              onChange={(e) => changeVersion(e.target.value)}
            >
              {!overview && <option value="">Loading nights…</option>}
              {overview?.nights.map((n) => (
                <option key={n.planningNight} value={n.planningNight}>
                  {n.planningNight}
                </option>
              ))}
            </select>
            <button
              className="planner-button"
              onClick={compareVersions}
              disabled={!snapshot || !!busy}
            >
              Compare versions
            </button>
          </div>
        </div>
        {!!overview?.pendingCount && (
          <div className="planner-banner">
            <AlertCircle size={18} />
            <strong>{overview.pendingCount} submissions await review</strong>
            <span>Not included in this draft.</span>
            <Link href={`/requests?${new URLSearchParams({ planningNight: overview.planningNight!, ...(snapshot ? { plan: snapshot.provenance.planId } : {}), ...(selectedRequestId ? { planRequest: selectedRequestId } : {}) })}`}>
              Review requests →
            </Link>
          </div>
        )}
        {error && (
          <div role="alert" className="planner-banner error">
            {error}
            <button
              className="planner-button quiet"
              disabled={!!busy}
              onClick={refreshStatus}
            >
              Refresh status
            </button>
          </div>
        )}
        {snapshot && plan && (
          <section className="planner-summary" aria-label="Night summary">
            <div>
              <strong>
                {plan.placements.length} / {snapshot.facts.requests.length}
              </strong>
              <span>Requests scheduled</span>
            </div>
            <div>
              <strong>
                {mandatoryPlaced} / {mandatory.length}
              </strong>
              <span>Mandatory work covered</span>
            </div>
            <div>
              <strong>{plan.deferred.length}</strong>
              <span>Deferred for review</span>
            </div>
            <div>
              <strong>{criticalCount}</strong>
              <span>Critical constraint violations</span>
            </div>
          </section>
        )}
        {snapshot && <CoordinationSummary planId={snapshot.provenance.planId} />}
        {snapshot && <DeferredWorkSummary planId={snapshot.provenance.planId} snapshot={snapshot} />}
        <section className="planner-toolbar" aria-label="Draft controls">
          <span className="planner-version">
            {preview
              ? "Unsaved preview"
              : snapshot
                ? `${snapshot.assessment.publicationState === "draft" ? "Draft" : snapshot.assessment.publicationState === "published" ? "Published" : "Superseded"} · ${short(snapshot.provenance.planId)}`
                : recoveryTarget
                  ? "Saved version awaiting refresh"
                  : "New draft"}
          </span>
          {snapshot && (
            <span className="planner-inputs">
              {stale || engineMismatch ? <AlertCircle /> : <CheckCircle2 />}
              {stale
                ? "Inputs changed"
                : engineMismatch
                  ? "Engine changed"
                  : "Inputs current"}
            </span>
          )}
          <div className="planner-actions">
            <label htmlFor="planner-objective">Objective</label>
            <select
              id="planner-objective"
              className="planner-field"
              value={strategy}
              disabled={!!busy}
              onChange={(e) => {
                const next = e.target.value as StrategyId;
                if (snapshot && !stale && !engineMismatch)
                  void analyse(next, pins);
                else setStrategy(next);
              }}
            >
              {strategyList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              className="planner-button"
              disabled={!snapshot || !!busy}
              onClick={() => void compareObjectives()}
            >
              Compare objectives
            </button>
            <button
              className="planner-button primary"
              disabled={
                !overview?.planningNight ||
                !!recoveryTarget ||
                !!busy ||
                (!!preview && (stale || engineMismatch))
              }
              onClick={() => void generate()}
            >
              {stale || engineMismatch
                ? "Generate from current inputs"
                : snapshot
                  ? "Generate revised draft"
                  : "Generate and save plan"}
            </button>
          </div>
        </section>
        <p
          role="status"
          aria-label="Plan operation status"
          aria-live="polite"
          className="planner-operation"
        >
          {busy ||
            notice ||
            (snapshot
              ? `Saved ${stamp(snapshot.provenance.generatedAt)} SGT. Source revision ${snapshot.provenance.sourceRevision}.`
              : "")}
        </p>
        {coordinationTarget && (
          <div className="planner-banner">
            <strong>Coordination case {short(coordinationTarget.id)} created</strong>
            <span>No saved plan has been applied or published.</span>
            <Link className="planner-link" href={coordinationTarget.href}>
              Open coordination case
            </Link>
          </div>
        )}
        {preview && (
          <div className="planner-banner">
            <strong>Unsaved preview</strong>
            <span>The saved version has not changed.</span>
            <button
              className="planner-link"
              onClick={() => openModal("changes")}
            >
              View changes
            </button>
            <button
              className="planner-button quiet"
              disabled={!!busy}
              onClick={() => {
                updatePreview(null);
                setStrategy(snapshot!.parameters.strategy);
                setNotice("Preview discarded. Showing the saved version.");
              }}
            >
              Discard preview
            </button>
          </div>
        )}
        {(stale || engineMismatch) && (
          <div className="planner-banner">
            This historical snapshot remains inspectable. Generate from current
            inputs before saving revisions or publishing.
          </div>
        )}
        {snapshot && plan && context ? (
          <>
            <PlannerConflictReview
              key={JSON.stringify([snapshot.provenance.planId, strategy, pins])}
              planId={snapshot.provenance.planId} strategy={strategy} locked={pins}
              disabled={!!busy || stale || engineMismatch || snapshot.assessment.publicationState === "superseded"}
              onSelectRequest={selectRequest} onRepair={id => void repair(id)}
            />
            <div className="planner-mobile-controls">
              <button
                className="planner-button"
                onClick={() => openModal("queue")}
              >
                <ListFilter size={15} /> Work requests
              </button>
              <button
                className="planner-button"
                onClick={() => openModal("inspector")}
              >
                Request details
              </button>
            </div>
            <div className="planner-columns">
              <aside className="planner-panel planner-queue-panel">
                {queue}
              </aside>
              <section
                className="planner-panel planner-center"
                aria-label="Engineering workspace"
              >
                <PlannerTimeline
                  headerActions={<div className="planner-tabs" aria-label="Timeline context">
                    {["Workforce", "Geography", "Calculations"].map((t) => (
                      <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>
                    ))}
                  </div>}
                  facts={snapshot.facts}
                  plan={plan}
                  selectedRequestId={selectedRequestId}
                  onSelectRequest={selectRequest}
                />
                <div className="planner-context-header" hidden={tab === "Workforce"}>
                  <h2 className="planner-panel-title">
                    {tab === "Workforce"
                      ? "Workforce availability"
                      : tab === "Geography"
                        ? "Geographic context"
                        : "Calculated metrics"}
                  </h2>
                </div>
                <div className="planner-context-body" data-view={tab}>
                  <div hidden={tab !== "Workforce"}>
                    <WorkforceChart
                      compact
                      plan={plan}
                      context={context}
                      stale={false}
                      infeasible={!validated}
                      selectedRequestId={selectedRequestId}
                      onSelectRequest={selectRequest}
                    />
                  </div>
                  <div hidden={tab !== "Geography"}>
                    <GeographicRailMap
                      plan={plan}
                      context={context}
                      selectedRequestId={selectedRequestId}
                      onSelectRequest={selectRequest}
                    />
                  </div>
                  <div
                    hidden={tab !== "Calculations"}
                    className="planner-metrics"
                  >
                    {metrics &&
                      Object.values(metrics).map((metric) => (
                        <Figure key={metric.key} metric={metric} />
                      ))}
                  </div>
                </div>
              </section>
              <aside className="planner-panel planner-inspector-panel">
                {inspector}
              </aside>
            </div>
            <section
              className="planner-footer"
              aria-label="Publication readiness"
            >
              {validated ? (
                <CheckCircle2 size={30} />
              ) : (
                <AlertCircle size={30} />
              )}
              <div>
                <strong>
                  {preview
                    ? "Review the unsaved preview"
                    : validated
                      ? "Draft validation passed"
                      : "Plan needs attention"}
                </strong>
                <p className="planner-muted">
                  {preview
                    ? "Generate a saved draft before publication."
                    : validated
                      ? `All mandatory work is placed. Review ${plan.deferred.length} deferrals before publishing.`
                      : `${mandatory.length - mandatoryPlaced} mandatory requests unplaced; ${criticalCount} critical violations.`}
                </p>
              </div>
              <div className="planner-actions">
                <button
                  className="planner-button"
                  disabled={!!busy}
                  onClick={() => openModal("details")}
                >
                  Version details
                </button>
                <button
                  className="planner-button primary"
                  disabled={!canPublish || !!busy}
                  onClick={() => openModal("publish")}
                >
                  {snapshot.assessment.publicationState === "published"
                    ? "Current publication"
                    : snapshot.assessment.publicationState === "superseded"
                      ? "Superseded version"
                      : "Review publication"}
                  <ArrowRight size={15} />
                </button>
              </div>
            </section>
          </>
        ) : (
          !busy &&
          overview && (
            <section className="planner-empty">
              <h2 className="text-xl font-semibold">
                {recoveryTarget
                  ? "Saved version could not be loaded."
                  : "No saved versions for this night."}
              </h2>
              <p className="mt-2 planner-muted">
                {recoveryTarget
                  ? `Refresh status to inspect version ${recoveryTarget.id}.`
                  : "Generate a draft from approved requests to start planning."}
              </p>
            </section>
          )
        )}
        <footer className="planner-disclaimer">
          <Link className="planner-link mr-4" href={`/sandbox?${new URLSearchParams({ ...(overview?.planningNight ? { night: overview.planningNight } : {}), ...(snapshot ? { plan: snapshot.provenance.planId } : {}), ...(selectedRequestId ? { request: selectedRequestId } : {}) })}`}>
            Demo sandbox
          </Link>
          <Link
            className="planner-link mr-4"
            href={`/settings/notifications?${new URLSearchParams({ ...(overview?.planningNight ? { night: overview.planningNight } : {}), ...(snapshot ? { plan: snapshot.provenance.planId } : {}), ...(selectedRequestId ? { request: selectedRequestId } : {}) })}`}
          >
            Notification settings
          </Link>
          Fabricated inputs. Not for operational decisions.
        </footer>
      </main>
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open && !busyRef.current) setModal(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (busyRef.current) event.preventDefault();
          }}
          className={
            modal === "compare" || modal === "objectives"
              ? "w-[min(1000px,calc(100vw-32px))]"
              : ""
          }
        >
          <DialogTitle>{modal ? modalTitle[modal] : "Plan review"}</DialogTitle>
          <DialogDescription>
            {modal === "publish"
              ? "Review the saved version before making it the current publication."
              : "RailPlan · Non-operational prototype"}
          </DialogDescription>
          <div className="planner-dialog-content">
            {error && (
              <div role="alert" className="planner-banner error">
                {error}
                <button
                  className="planner-button quiet"
                  disabled={!!busy}
                  onClick={refreshStatus}
                >
                  Refresh status
                </button>
              </div>
            )}
            {notice && <p role="status">{notice}</p>}
            {modal === "history" && (
              <>
                <p className="planner-muted">
                  Versions retain original facts and calculations. Dates shown
                  in SGT.
                </p>
                {versions.map((version) => (
                  <button
                    key={version.id}
                    className="planner-history-item"
                    disabled={!!busy}
                    aria-pressed={snapshot?.provenance.planId === version.id}
                    aria-label={`Open version ${version.id}`}
                    onClick={() =>
                      changeVersion(version.planningNight, version.id)
                    }
                  >
                    <strong>{title(version)}</strong>
                    <span className="block planner-muted">
                      {stamp(version.createdAt)} · {version.strategy} · Source{" "}
                      {version.sourceRevision}
                    </span>
                  </button>
                ))}
                {!versions.length && <p>No saved versions for this night.</p>}
                {overview?.nextCursor && (
                  <button
                    className="planner-button"
                    disabled={!!busy}
                    onClick={() => void loadMore()}
                  >
                    Load earlier versions
                  </button>
                )}
                <button
                  className="planner-button"
                  disabled={!!busy}
                  onClick={() => {
                    if (discardForNavigation()) {
                      updatePreview(null);
                      setModal(null);
                      void load(
                        overview?.planningNight,
                        snapshot?.provenance.planId,
                        selectedRequestId,
                      );
                    }
                  }}
                >
                  Refresh versions
                </button>
              </>
            )}
            {modal === "objectives" && (
              <ObjectiveComparison
                comparisons={comparisons}
                disabled={!!busy || engineMismatch}
                onChoose={(candidate) => {
                  if (
                    busyRef.current ||
                    candidate.basis.planId !== snapshot?.provenance.planId
                  )
                    return;
                  updatePreview(candidate);
                  setStrategy(candidate.parameters.strategy);
                  setModal(null);
                }}
              />
            )}
            {modal === "compare" && snapshot && (
              <>
                <p>
                  Comparing saved versions only. Unsaved previews are excluded.
                </p>
                <label>
                  Baseline version
                  <select
                    className="planner-field block w-full mt-1"
                    disabled={!!busy}
                    value={comparisonBase?.provenance.planId ?? ""}
                    onChange={(e) => void loadComparison(e.target.value)}
                  >
                    <option value="" disabled>
                      Select a version
                    </option>
                    {versions
                      .filter((p) => p.id !== snapshot.provenance.planId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {title(p)} · {stamp(p.createdAt)}
                        </option>
                      ))}
                  </select>
                </label>
                {overview?.nextCursor && (
                  <button
                    className="planner-button"
                    disabled={!!busy}
                    onClick={() => void loadMore()}
                  >
                    Load earlier versions
                  </button>
                )}
                {comparisonBase ? (
                  <PlanComparison base={comparisonBase} target={snapshot} />
                ) : (
                  <p className="planner-muted">
                    {busy || "Choose another saved version from this night."}
                  </p>
                )}
              </>
            )}
            {modal === "queue" && queue}
            {modal === "inspector" && inspector}
            {modal === "changes" && snapshot && preview && (
              <PreviewChanges snapshot={snapshot} preview={preview} />
            )}
            {modal === "publish" && snapshot && (
              <>
                <p>
                  <strong>Draft · {short(snapshot.provenance.planId)}</strong>{" "}
                  for {snapshot.provenance.planningNight}
                </p>
                <p>
                  {validated
                    ? "Independent validation passed."
                    : "Validation has not passed."}{" "}
                  Source {snapshot.provenance.sourceRevision}
                  {stale ? " is stale." : " is current as last checked."}
                </p>
                <p>
                  {overview?.currentPublication
                    ? `Replaces publication ${short(overview.currentPublication.id)}. The old version stays in history.`
                    : "This will become the first publication for this night."}
                </p>
                <h3 className="font-semibold">
                  Deferred work ({snapshot.deferrals.length})
                </h3>
                <ul className="space-y-2">
                  {snapshot.deferrals.map((d) => (
                    <li key={d.requestId}>
                      <strong>
                        {d.requestId} · {d.title}
                      </strong>
                      <p className="planner-muted">{d.reason}</p>
                    </li>
                  ))}
                </ul>
                {overview?.currentPublication && (
                  <button className="planner-button" onClick={compareVersions}>
                    Review changes from publication
                  </button>
                )}
                <p className="text-sm">
                  Publication sends scoped messages to affected contractor
                  destinations after the version is saved as current. Delivery
                  failures do not undo publication. The server rechecks current
                  inputs and validation.
                </p>
                <PublicationCoordinationStatus
                  planId={snapshot.provenance.planId}
                />
                <button
                  className="planner-button primary"
                  disabled={!canPublish || !!busy}
                  onClick={() => void publish()}
                >
                  {busy || "Publish this version"}
                </button>
              </>
            )}
            {modal === "details" && snapshot && (
              <VersionDetails
                snapshot={snapshot}
                busy={!!busy}
                warning={notificationWarning}
                onDecision={async (kind, reason) => {
                  if (busyRef.current)
                    throw new Error(
                      "Wait for the current operation to finish.",
                    );
                  const ticket = ++epoch.current;
                  controller.current?.abort();
                  const abort = new AbortController();
                  controller.current = abort;
                  const current = () =>
                    ticket === epoch.current && !abort.signal.aborted;
                  busyRef.current = true;
                  setBusy("Recording review decision…");
                  try {
                    await plannerRequest(
                      `/api/plans/${snapshot.provenance.planId}/decisions`,
                      { kind, reason },
                      abort.signal,
                    );
                    if (current())
                      setNotice("Decision recorded in the audit history.");
                  } finally {
                    if (current()) {
                      busyRef.current = false;
                      setBusy("");
                    }
                  }
                }}
              />
            )}
            {busy && <p role="status">{busy}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
