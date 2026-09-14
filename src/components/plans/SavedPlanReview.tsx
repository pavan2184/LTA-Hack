"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlanExport } from "@railplan/core/types/exports";
import type { Plan } from "@railplan/core/types/railplan";
import { buildWorld, type PlanningWorld } from "@railplan/core/domain/world";
import { formatClock } from "@railplan/core/engine/intervals";
import { Figure } from "@/components/shared/Figure";
import { WorkforceChart } from "@/components/schedule/WorkforceChart";
import { GeographicRailMap } from "@/components/network/GeographicRailMap";
import { PlanningPanels } from "@/components/layout/PlanningPanels";
import { revisionEngineMatches } from "@/lib/plans/revision";
import { PlanRevisionEditor } from "./PlanRevisionEditor";

const button =
  "rounded border border-rule-strong px-2 py-1 text-sm hover:bg-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const interval = (p: { startMinute: number; endMinute: number }) =>
  `${formatClock(p.startMinute)}–${formatClock(p.endMinute)}`;

interface ReviewProps {
  planId: string;
  onSaveRevision?: (parameters: PlanExport["parameters"]) => Promise<void>;
  busy?: boolean;
  onStatus?: (status: { planId: string; stale: boolean }) => void;
  onRevisionChange?: (revising: boolean) => void;
}
/** Saved visualizations remain immutable; revision proposals are separate. */
export function SavedPlanReview({ planId, onSaveRevision, busy = false, onRevisionChange, onStatus }: ReviewProps) {
  const [refresh, setRefresh] = useState(0);
  const [revising, setRevising] = useState(false);
  const changeRevision = (value: boolean) => {
    setRevising(value);
    onRevisionChange?.(value);
  };
  return (
    <section
      aria-label="Saved version visual review"
      className="min-w-0 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Review the schedule</h2>
        <button
          className={button}
          disabled={busy || revising}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Refresh saved review/status
        </button>
      </div>
      <LoadSavedReview key={`${planId}:${refresh}`} planId={planId} onSaveRevision={onSaveRevision} busy={busy} revising={revising} onRevisionChange={changeRevision} onStatus={onStatus} />
    </section>
  );
}

function LoadSavedReview({ planId, onSaveRevision, busy, revising, onRevisionChange, onStatus }: ReviewProps & { revising: boolean }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; snapshot: PlanExport }
  >({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const response = await fetch(
          `/api/plans/${encodeURIComponent(planId)}/export?format=json`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("Saved review unavailable");
        const snapshot: PlanExport = await response.json();
        if (
          snapshot.exportVersion !== 1 ||
          snapshot.provenance?.planId !== planId ||
          !snapshot.facts
        )
          throw new Error("Unexpected saved review");
        if (active) {
          setState({ kind: "ready", snapshot });
          onStatus?.({ planId, stale: snapshot.assessment.stale });
        }
      } catch {
        if (active) setState({ kind: "error" });
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [planId, onStatus]);
  if (state.kind === "loading")
    return <p role="status">Loading saved version…</p>;
  if (state.kind === "error")
    return (
      <p role="alert">
        Could not load this saved version. Check your connection and planner
        access, then refresh saved review/status.
      </p>
    );
  return <SnapshotReview snapshot={state.snapshot} onSaveRevision={onSaveRevision} busy={busy} revising={revising} onRevisionChange={onRevisionChange} />;
}

function SnapshotReview({ snapshot, onSaveRevision, busy = false, revising, onRevisionChange }: { snapshot: PlanExport; revising: boolean } & Omit<ReviewProps, "planId">) {
  const world = useMemo(() => buildWorld(snapshot.facts), [snapshot.facts]);
  const context = useMemo(() => ({ world }), [world]);
  const plan = useMemo<Plan>(
    () => ({ placements: snapshot.placements, deferred: snapshot.deferrals }),
    [snapshot],
  );
  const [selectedRequestId, selectRequest] = useState<string | null>(null);
  const localEngineMatches = revisionEngineMatches(snapshot);
  const { assessment, provenance } = snapshot;
  const selection = { snapshot, world, selectedRequestId, selectRequest };
  return (
    <div className="min-w-0 space-y-4">
      {(assessment.stale || assessment.publicationState === "superseded" || provenance.status === "INFEASIBLE") && <p className="rounded border border-signal-amber bg-sunk p-3 text-sm" role="status">
        {assessment.stale ? "Planning inputs changed. Create a fresh draft above before publishing." : assessment.publicationState === "superseded" ? "A newer schedule has been published. Open the current version from history." : "This schedule has unresolved blockers. Review the conflicts and unscheduled work before publishing."}
      </p>}
      {onSaveRevision && <div className="space-y-3">
        <button className={button} disabled={busy || !localEngineMatches || assessment.stale || assessment.publicationState === "superseded"}
          aria-expanded={revising} onClick={() => onRevisionChange?.(!revising)}>
          {revising ? "Discard revision preview" : "Review conflicts and revise"}
        </button>
        {(assessment.stale || assessment.publicationState === "superseded") && <p className="text-sm">Generate or open a current version before revising.</p>}
        {!localEngineMatches && <p className="text-sm">Reload the page to use the current planning engine before revising.</p>}
        {revising && <PlanRevisionEditor snapshot={snapshot} selectedRequestId={selectedRequestId}
          selectRequest={selectRequest} onSave={onSaveRevision} busy={busy} />}
      </div>}
      <PlanningPanels
        preferenceKey="railplan-saved-layout"
        queue={<SavedQueue {...selection} />}
        primary={<SavedGantt {...selection} />}
        inspector={<SavedInspector {...selection} />}
        workforce={
          <div className="space-y-2">
            <p className="text-xs text-ink-700">
              Workforce intervals are a display calculation from saved
              availability, staffing and placements. Saved validation and
              headline metrics above/below remain unchanged.
            </p>
            <WorkforceChart
              plan={plan}
              context={context}
              infeasible={provenance.status === "INFEASIBLE"}
              selectedRequestId={selectedRequestId}
              onSelectRequest={selectRequest}
            />
          </div>
        }
        geography={
          <div className="space-y-2">
            <p className="text-xs text-ink-700">
              Offline geography uses the bundled local station snapshot.
              Planning blocks and request selection use this version’s saved
              facts; geography does not determine feasibility.
            </p>
            <GeographicRailMap
              plan={plan}
              context={context}
              selectedRequestId={selectedRequestId}
              onSelectRequest={selectRequest}
            />
          </div>
        }
        belowPrimary={<details className="rounded border border-rule p-3"><summary className="cursor-pointer text-sm font-medium">Schedule metrics and validation findings</summary><div className="mt-4"><SavedResults snapshot={snapshot} /></div></details>}
      />
      <details open={assessment.stale || assessment.publicationState === "superseded" || provenance.status === "INFEASIBLE"}
        className="space-y-2 rounded border border-rule bg-sunk p-3 text-sm">
        <summary className="cursor-pointer font-medium">{assessment.stale ? "Planning inputs have changed — review this version" : provenance.status === "INFEASIBLE" ? "This schedule has unresolved blockers" : assessment.publicationState === "superseded" ? "A newer schedule has been published" : "Saved version details and validation"}</summary>
        <p className="font-semibold">{snapshot.notice}</p>
        <p>
          Immutable saved placements and planning facts. Status is observed when
          loaded; refresh to check it again. Saved results are not recalculated.
        </p>
        <p>
          Publication: {assessment.publicationState} · Saved solver status:{" "}
          {provenance.status}
        </p>
        {assessment.publicationState === "draft" && (
          <p>Draft version: this plan has not been published.</p>
        )}
        {assessment.publicationState === "superseded" && (
          <p>
            Superseded version: a later version was published for this night.
          </p>
        )}
        {assessment.sourceFreshness === "stale" && (
          <p>
            Create a fresh draft above to use the current approved work before publishing.
            Source stale: saved revision {provenance.sourceRevision}; observed
            current revision {assessment.currentSourceRevision}. All views below
            retain the saved facts.
          </p>
        )}
        {!assessment.engineVersionMatch && (
          <p>
            Saved solver or constraint version differs from the current engine.
          </p>
        )}
        {provenance.status === "INFEASIBLE" && (
          <p>
            Infeasible saved result: these placements are not a feasible
            schedule.
          </p>
        )}
        <p>
          Saved independent validation:{" "}
          {snapshot.validation.independentlyValidated ? "passed" : "failed"}.
          This is a recorded prototype result, not safety approval.
        </p>
      </details>
      <details className="break-words text-sm">
        <summary className="cursor-pointer font-medium">
          Saved provenance and parameters
        </summary>
        <dl className="mt-2 space-y-1">
          {Object.entries({
            "Plan ID": provenance.planId,
            "Planning night": provenance.planningNight,
            "Input digest": provenance.inputDigest,
            "Source revision": provenance.sourceRevision,
            "Generated at": provenance.generatedAt,
            "Solver version": provenance.solverVersion,
            "Constraint version": provenance.constraintVersion,
            Strategy: snapshot.parameters.strategy,
            "Saved solve duration": `${provenance.solveMs} ms`,
            "Saved candidate count": provenance.candidatesEvaluated,
            "Pinned input placements": snapshot.parameters.locked.length,
            ...(snapshot.parameters.basedOnPlanId ? { "Based on version": snapshot.parameters.basedOnPlanId } : {}),
          }).map(([label, value]) => (
            <div key={label}>
              <dt className="inline font-medium">{label}: </dt>
              <dd className="inline">{value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

interface SelectionProps {
  snapshot: PlanExport;
  world: PlanningWorld;
  selectedRequestId: string | null;
  selectRequest: (id: string) => void;
}
function SavedQueue({
  snapshot,
  selectedRequestId,
  selectRequest,
}: SelectionProps) {
  return (
    <section aria-label="Saved request queue" className="space-y-3">
      <h3 className="font-semibold">Saved request queue</h3>
      <p className="text-xs">
        {snapshot.placements.length} placed · {snapshot.deferrals.length}{" "}
        deferred
      </p>
      <ul className="space-y-2">
        {[
          ...snapshot.placements.map((request) => ({
            ...request,
            state: "Placed",
          })),
          ...snapshot.deferrals.map((request) => ({
            ...request,
            state: "Deferred",
          })),
        ].map((request) => (
          <li key={request.requestId}>
            <button
              className={`${button} w-full break-words text-left ${selectedRequestId === request.requestId ? "border-accent bg-sunk" : ""}`}
              aria-pressed={selectedRequestId === request.requestId}
              onClick={() => selectRequest(request.requestId)}
            >
              <span className="block text-xs">
                {request.requestId} · {request.state}
              </span>
              <span>{request.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {!snapshot.placements.length && !snapshot.deferrals.length && (
        <p>No saved requests.</p>
      )}
    </section>
  );
}

function SavedGantt({
  snapshot,
  world,
  selectedRequestId,
  selectRequest,
}: SelectionProps) {
  const start = Math.min(
    world.windowStart,
    ...snapshot.placements.map((p) => p.startMinute),
  );
  const end = Math.max(
    world.windowEnd,
    ...snapshot.placements.map((p) => p.endMinute),
  );
  const width = Math.max(1, end - start);
  return (
    <section aria-label="Saved block Gantt" className="min-w-0 space-y-3">
      <h3 className="font-semibold">Saved block Gantt</h3>
      <p className="text-xs">
        Atomic blocks, saved work times. Each bar has its own lane so
        simultaneous work remains visible. Clearance after work is listed in the
        inspector.
      </p>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="mb-2 ml-32 flex justify-between text-xs">
            <span>{formatClock(start)}</span>
            <span>{formatClock(end)}</span>
          </div>
          {world.blocks.map((block) => {
            const placements = snapshot.placements.filter((p) =>
              p.blockIds.includes(block.id),
            );
            return (
              <div
                key={block.id}
                className="grid grid-cols-[8rem_1fr] border-t border-rule py-2"
              >
                <span
                  className={`text-xs font-semibold ${{ NS: "text-line-ns-ink", EW: "text-line-ew-ink", CC: "text-line-cc-ink" }[block.line]}`}
                >
                  {block.id}
                </span>
                <div className="relative space-y-1 border-x border-rule">
                  {!placements.length && (
                    <span className="px-2 text-xs text-ink-500">
                      No saved work
                    </span>
                  )}
                  {placements.map((p) => (
                    <div key={p.requestId} className="relative h-9">
                      <button
                        aria-label={`Select ${p.requestId} on ${block.id}, ${interval(p)}`}
                        aria-pressed={selectedRequestId === p.requestId}
                        onClick={() => selectRequest(p.requestId)}
                        title={`${p.requestId} · ${p.title} · ${interval(p)}`}
                        className={`absolute top-0 h-9 min-w-2 overflow-hidden rounded border-2 bg-surface px-1 text-left text-xs text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${selectedRequestId === p.requestId ? "border-accent ring-2 ring-accent" : "border-rule-strong"}`}
                        style={{
                          left: `${((p.startMinute - start) / width) * 100}%`,
                          width: `${((p.endMinute - p.startMinute) / width) * 100}%`,
                        }}
                      >
                        <span className="block truncate">
                          {world.requestById[p.requestId]?.shortTitle ??
                            p.title}
                        </span>
                        <span className="whitespace-nowrap">{interval(p)}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Exact saved placements and deferrals
        </summary>
        <div className="overflow-x-auto">
          <table
            aria-label="Saved placements and deferrals"
            className="w-full text-left text-xs"
          >
            <thead>
              <tr>
                {[
                  "Request",
                  "State",
                  "Work time / reason",
                  "Atomic blocks",
                  "Team",
                ].map((label) => (
                  <th key={label} scope="col" className="p-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.placements.map((p) => (
                <tr key={p.requestId} className="border-t border-rule">
                  <th scope="row" className="p-2">
                    <button
                      className={button}
                      aria-pressed={selectedRequestId === p.requestId}
                      onClick={() => selectRequest(p.requestId)}
                    >
                      {p.requestId} · {p.title}
                    </button>
                  </th>
                  <td className="p-2">Placed</td>
                  <td className="whitespace-nowrap p-2">{interval(p)}</td>
                  <td className="p-2">{p.blockIds.join(", ")}</td>
                  <td className="p-2">
                    {world.teamById[p.teamId]?.name ?? p.teamId}
                  </td>
                </tr>
              ))}
              {snapshot.deferrals.map((p) => (
                <tr key={p.requestId} className="border-t border-rule">
                  <th scope="row" className="p-2">
                    <button
                      className={button}
                      aria-pressed={selectedRequestId === p.requestId}
                      onClick={() => selectRequest(p.requestId)}
                    >
                      {p.requestId} · {p.title}
                    </button>
                  </th>
                  <td className="p-2">Deferred</td>
                  <td className="p-2">{p.reason}</td>
                  <td className="p-2">{p.blockIds.join(", ")}</td>
                  <td className="p-2">Unscheduled</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function SavedInspector({
  snapshot,
  world,
  selectedRequestId,
}: SelectionProps) {
  const request = selectedRequestId
    ? world.requestById[selectedRequestId]
    : undefined;
  const placement = snapshot.placements.find(
    (p) => p.requestId === selectedRequestId,
  );
  const deferred = snapshot.deferrals.find(
    (p) => p.requestId === selectedRequestId,
  );
  const staffing = snapshot.facts.workforceDemand.filter(
    (row) => row.requestId === selectedRequestId,
  );
  return (
    <section
      aria-label="Saved request inspector"
      className="space-y-3 break-words text-sm"
    >
      <h3 className="font-semibold">Saved request inspector</h3>
      {!request ? (
        <p>
          Select a saved request from any view to inspect its immutable details.
        </p>
      ) : (
        <>
          <h4 className="font-semibold">{request.title}</h4>
          <p>
            {request.id} ·{" "}
            {request.submissionRevision
              ? `Revision ${request.submissionRevision}`
              : "Operator-seeded baseline"}
          </p>
          <p>{request.description}</p>
          <p>
            {request.mandatory ? "Mandatory" : "Optional"} · {request.priority}{" "}
            priority · {request.workClass}
          </p>
          <p>Atomic blocks: {request.blockIds.join(", ")}</p>
          {placement ? (
            <p>
              Saved work time: {interval(placement)} ·{" "}
              {placement.locked ? "Pinned" : "Unpinned"}
            </p>
          ) : (
            <p>Deferred: {deferred?.reason ?? "No saved placement"}</p>
          )}
          {deferred && (
            <p>
              Binding rules:{" "}
              {deferred.bindingRuleIds.join(", ") || "None recorded"}
            </p>
          )}
          <p>
            Team:{" "}
            {world.teamById[placement?.teamId ?? request.teamId]?.name ??
              request.teamId}{" "}
            ({placement?.teamId ?? request.teamId})
          </p>
          <p>
            Work duration: {request.durationMinutes} min · Clearance:{" "}
            {request.clearanceMinutes} min
          </p>
          <p>
            Requested window: {formatClock(request.earliestStart)}–
            {formatClock(request.latestEnd)} · Preferred start:{" "}
            {formatClock(request.preferredStart)}
          </p>
          <p>
            Saved staffing:{" "}
            {staffing.length
              ? staffing
                  .map(
                    (row) =>
                      `${snapshot.facts.workforceRoles.find((role) => role.id === row.roleId)?.name ?? row.roleId}: ${row.count}`,
                  )
                  .join("; ")
              : "Unknown; no declaration saved"}
          </p>
          <p>
            Equipment:{" "}
            {request.equipment
              .map(
                (row) =>
                  `${world.equipmentById[row.equipmentId]?.name ?? row.equipmentId}: ${row.units}`,
              )
              .join("; ") || "Explicitly none"}
          </p>
          <p>Skills: {request.requiredSkills.join(", ") || "None recorded"}</p>
          <p>
            Dependencies: {request.dependencies.join(", ") || "None"} · Lag:{" "}
            {request.dependencyLagMinutes} min
          </p>
          <p className="text-xs text-ink-500">
            Read-only saved revision. Changes require a new plan version.
          </p>
        </>
      )}
    </section>
  );
}

function SavedResults({ snapshot }: { snapshot: PlanExport }) {
  return (
    <section
      aria-label="Saved metrics and validation"
      className="min-w-0 space-y-4"
    >
      <h3 className="font-semibold">Saved metrics and validation</h3>
      <p className="text-xs">
        Persisted figures and formula inputs, unchanged since generation.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {Object.values(snapshot.metrics).map((metric) => (
          <Figure key={metric.key} metric={metric} />
        ))}
      </div>
      <dl className="text-sm">
        {snapshot.objectives.map((objective, index) => (
          <div key={index}>
            <dt className="inline">{objective.label}: </dt>
            <dd className="inline">
              {objective.value} {objective.unit}
            </dd>
          </div>
        ))}
      </dl>
      <details>
        <summary className="cursor-pointer text-sm">
          Saved validation findings ({snapshot.validation.violations.length})
        </summary>
        {!snapshot.validation.violations.length && (
          <p className="text-sm">No violations recorded in the saved result.</p>
        )}
        <ul className="space-y-3 text-sm">
          {snapshot.validation.violations.map((violation) => (
            <li key={violation.id}>
              <p className="font-medium">
                {violation.severity} · {violation.ruleId}: {violation.title}
              </p>
              <p>{violation.detail}</p>
              <p>Requests: {violation.requestIds.join(", ")}</p>
              <p>
                Observed: {violation.observed} · Required: {violation.required}
              </p>
              <p>{violation.remedy}</p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
