"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatClock } from "@railplan/core/engine/intervals";
import type { PlanExport } from "@railplan/core/types/exports";
import type { Placement, Plan } from "@railplan/core/types/railplan";
import type { PlanInspection, PlanPreview } from "@/lib/plans/workspace-types";
import type { CoordinationParameters } from "@railplan/core/types/coordination";
import { PlannerRequestHeader } from "./PlannerRequestHeader";
import { RecordDeferralAction } from "@/components/deferred-work/DeferredWorkSummary";

interface Props {
  snapshot: PlanExport;
  plan: Plan;
  preview: PlanPreview | null;
  selectedRequestId: string | null;
  disabled: boolean;
  onPin: (placement: Placement) => void;
  onUnpin: (id: string) => void;
  onSelectRequest: (id: string) => void;
  onCoordinate?: (
    requestId: string,
    parameters: CoordinationParameters,
  ) => Promise<void>;
}

export function PlannerInspector({
  snapshot,
  plan,
  preview,
  selectedRequestId,
  disabled,
  onPin,
  onUnpin,
  onSelectRequest,
  onCoordinate,
}: Props) {
  const [response, setResponse] = useState<{
    key: string;
    inspection?: PlanInspection;
    error?: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [coordinationError, setCoordinationError] = useState("");
  const planId = snapshot.provenance.planId;
  const request = snapshot.facts.requests.find(
    (r) => r.id === selectedRequestId,
  );
  const selectionKey = JSON.stringify({
    planId,
    requestId: request?.id,
    parameters: preview?.parameters ?? null,
    retry,
  });
  useEffect(() => {
    const selected = JSON.parse(selectionKey) as {
      planId: string;
      requestId?: string;
      parameters: PlanPreview["parameters"] | null;
    };
    if (!selected.requestId) return;
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const result = await fetch(
          `/api/plans/${encodeURIComponent(selected.planId)}/analysis`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              operation: "inspect",
              requestId: selected.requestId,
              ...(selected.parameters
                ? {
                    strategy: selected.parameters.strategy,
                    locked: selected.parameters.locked,
                  }
                : {}),
            }),
          },
        );
        if (!result.ok) throw new Error("inspection_failed");
        const inspection = (await result.json()) as PlanInspection;
        if (
          inspection.operation !== "inspect" ||
          inspection.requestId !== selected.requestId ||
          inspection.basis.planId !== selected.planId
        )
          throw new Error("inspection_mismatch");
        if (active) setResponse({ key: selectionKey, inspection });
      } catch {
        if (active && !controller.signal.aborted)
          setResponse({
            key: selectionKey,
            error: "Request analysis could not be loaded.",
          });
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectionKey]);

  const current = response?.key === selectionKey ? response : null;
  const inspection = current?.inspection;
  const placement = plan.placements.find(
    (p) => p.requestId === selectedRequestId,
  );
  const deferred = plan.deferred.find((p) => p.requestId === selectedRequestId);
  const historical =
    snapshot.assessment.stale ||
    snapshot.assessment.publicationState === "superseded" ||
    preview?.stale ||
    inspection?.stale;
  const revisionDisabled = disabled || !!historical || !inspection;
  const alternatives =
    inspection?.alternatives
      .filter((alternative) => alternative.feasible)
      .slice(0, 3) ?? [];
  const locked =
    !!placement &&
    (placement.locked ||
      (preview?.parameters.locked ?? snapshot.parameters.locked).some(
        (p) => p.requestId === placement.requestId,
      ));

  return (
    <section className="planner-inspector" aria-label="Saved request inspector">
      <h2 className="planner-panel-title">Request details</h2>
      {!request ? (
        <p className="planner-muted">
          Select a request to inspect its saved times and available
          alternatives.
        </p>
      ) : (
        <>
          <PlannerRequestHeader request={request} placement={placement} deferred={!!deferred} plannedLabel={preview ? "Preview" : "Planned"}>
          {request.submissionRevision !== undefined && /^R-[0-9a-f-]{36}$/i.test(request.id) && <Link className="planner-link inline-block mt-2" href={`/requests?${new URLSearchParams({ planningNight: snapshot.provenance.planningNight, request: request.id.slice(2), plan: planId, planRequest: request.id })}`}>Open submitted request</Link>}
          </PlannerRequestHeader>
          <p className="planner-muted">
            {snapshot.facts.teams.find(
              (t) => t.id === (placement?.teamId ?? request.teamId),
            )?.name ?? request.teamId}
          </p>
          {placement && (
            <p className="planner-muted">
              Block clear at{" "}
              {formatClock(placement.endMinute + request.clearanceMinutes)}
            </p>
          )}
          <div className="planner-inspector-section" aria-live="polite">
            <h4>
              {deferred
                ? "Why deferred"
                : placement?.startMinute !== request.preferredStart
                  ? "Why this time"
                  : "Placement explanation"}
            </h4>
            {!current && (
              <p className="planner-muted">Loading request analysis…</p>
            )}
            {current?.error && (
              <div>
                <p role="alert">{current.error}</p>
                <button
                  type="button"
                  className="planner-link"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Retry analysis
                </button>
              </div>
            )}
            {inspection && (
              <>
                <p>{inspection.explanation.summary}</p>
                {inspection.explanation.blockers.map((blocker) => (
                  <div key={blocker.id} style={{ marginTop: 10 }}>
                    <p>{blocker.title}</p>
                    <p className="planner-muted">{blocker.detail}</p>
                    {blocker.requestIds
                      .filter(
                        (id) =>
                          id !== request.id &&
                          snapshot.facts.requests.some((r) => r.id === id),
                      )
                      .map((id) => (
                        <button
                          type="button"
                          className="planner-link"
                          key={id}
                          onClick={() => onSelectRequest(id)}
                          style={{ marginRight: 10 }}
                        >
                          Inspect {id}
                        </button>
                      ))}
                  </div>
                ))}
              </>
            )}
            {deferred && (
              <p className="planner-muted" style={{ marginTop: 8 }}>
                {deferred.reason}
              </p>
            )}
          </div>
          <div className="planner-inspector-section">
            <h4>Alternative slots</h4>
            {!!historical && (
              <p className="planner-muted">
                This historical or stale version cannot be revised. Generate a
                current plan to make changes.
              </p>
            )}
            {inspection && !alternatives.length && (
              <p className="planner-muted">
                No valid alternative slots are available.
              </p>
            )}
            {alternatives.map((alternative) => (
              <button
                key={alternative.id}
                type="button"
                className="planner-alternative"
                disabled={revisionDisabled}
                onClick={() =>
                  onPin({
                    requestId: request.id,
                    startMinute: alternative.startMinute,
                    endMinute: alternative.endMinute,
                    teamId: request.teamId,
                    locked: true,
                  })
                }
              >
                <strong>
                  {formatClock(alternative.startMinute)}–
                  {formatClock(alternative.endMinute)}
                </strong>
                <span>{alternative.whyItWorks}</span>
                <span
                  className="planner-muted"
                  style={{ display: "block", marginTop: 5 }}
                >
                  {alternative.impact}
                </span>
              </button>
            ))}
            {placement && (
              <button
                type="button"
                className="planner-button"
                style={{ marginTop: 12, width: "100%" }}
                disabled={revisionDisabled}
                onClick={() =>
                  locked
                    ? onUnpin(request.id)
                    : onPin({ ...placement, locked: true })
                }
              >
                {locked ? "Unpin request" : "Pin this time"}
              </button>
            )}
            {!locked && (
              <button
                type="button"
                className="planner-button"
                style={{ marginTop: 12, width: "100%" }}
                disabled={revisionDisabled}
                onClick={() => onPin({
                  requestId: request.id,
                  teamId: request.teamId,
                  startMinute: request.preferredStart,
                  endMinute: request.preferredStart + request.durationMinutes,
                  locked: true,
                })}
              >
                Try requested time
              </button>
            )}
            <p className="planner-muted" style={{ marginTop: 10 }}>
              Slot changes create a preview. Save a new version to retain them.
            </p>
          </div>
          {snapshot.deferrals.some(item => item.requestId === request.id) && <div className="planner-inspector-section space-y-2">
            <h4>Track deferred work</h4>
            <p className="planner-muted">Record the exact saved deferral. Draft alternatives do not increment history.</p>
            <RecordDeferralAction key={`${planId}:${request.id}`} planId={planId} requestId={request.id} disabled={disabled || !!preview} />
          </div>}
          {onCoordinate && inspection && !historical && (
            <div className="planner-inspector-section space-y-2">
              <h4>Coordinate a proposed change</h4>
              <p className="planner-muted">
                Start a private case from the current objective and pins, or
                one of the validated alternatives above. This does not Apply
                or publish a plan.
              </p>
              <button
                type="button"
                className="planner-button w-full"
                disabled={disabled}
                onClick={() => {
                  setCoordinationError("");
                  void onCoordinate(request.id, {
                    planningNight: snapshot.provenance.planningNight,
                    strategy:
                      preview?.parameters.strategy ?? snapshot.parameters.strategy,
                    locked: (preview?.parameters.locked ?? snapshot.parameters.locked).map(
                      ({ requestId, teamId, startMinute, endMinute }) => ({
                        requestId,
                        teamId,
                        startMinute,
                        endMinute,
                      }),
                    ),
                  }).catch((cause) =>
                    setCoordinationError(
                      cause instanceof Error
                        ? cause.message
                        : "The coordination case could not be created.",
                    ),
                  );
                }}
              >
                Coordinate current {preview ? "preview" : "saved parameters"}
              </button>
              {alternatives.map((alternative) => (
                <button
                  type="button"
                  className="planner-button w-full"
                  key={`coordinate-${alternative.id}`}
                  disabled={disabled}
                  aria-label={`Coordinate validated slot ${formatClock(alternative.startMinute)}–${formatClock(alternative.endMinute)}`}
                  onClick={() => {
                    setCoordinationError("");
                    const currentPins =
                      preview?.parameters.locked ?? snapshot.parameters.locked;
                    void onCoordinate(request.id, {
                      planningNight: snapshot.provenance.planningNight,
                      strategy:
                        preview?.parameters.strategy ??
                        snapshot.parameters.strategy,
                      locked: [
                        ...currentPins
                          .filter((pin) => pin.requestId !== request.id)
                          .map(
                            ({
                              requestId,
                              teamId,
                              startMinute,
                              endMinute,
                            }) => ({
                              requestId,
                              teamId,
                              startMinute,
                              endMinute,
                            }),
                          ),
                        {
                          requestId: request.id,
                          teamId: request.teamId,
                          startMinute: alternative.startMinute,
                          endMinute: alternative.endMinute,
                        },
                      ],
                    }).catch((cause) =>
                      setCoordinationError(
                        cause instanceof Error
                          ? cause.message
                          : "The coordination case could not be created.",
                      ),
                    );
                  }}
                >
                  Coordinate {formatClock(alternative.startMinute)}–
                  {formatClock(alternative.endMinute)}
                </button>
              ))}
              {coordinationError && <p role="alert">{coordinationError}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
