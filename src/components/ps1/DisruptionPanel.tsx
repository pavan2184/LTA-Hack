"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  assessDisruption,
  capacityAt,
  type Disruption,
  type ReplanOutcome,
} from "@railplan/ps1/engine/disruption";
import { buildTimeline } from "@railplan/ps1/engine/timeline";
import { validate } from "@railplan/ps1/engine/validate";
import type { Network } from "@railplan/ps1/engine/network";
import type { Pin } from "@railplan/ps1/engine/schedule";
import type { Ps1Instance, SolveDiagnostics, Submission } from "@railplan/ps1/types/ps1";
import { requestPs1Solve } from "@/lib/ps1/client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionNote } from "@/components/ps1/ActionNote";
import { locationDetail } from "@/components/ps1/location";

const NO_DISRUPTIONS: Disruption[] = [];
const NO_PINS: Pin[] = [];

/**
 * Urgent maintenance takes nights away; this works out what that costs and
 * re-plans around it.
 *
 * The number that matters here is churn, not the score. A replan that rebuilds
 * the horizon would validate just as well and be useless at 2am, because every
 * moved access is a contractor who has to be telephoned.
 */
export function DisruptionPanel({
  instance,
  submission,
  network,
  existingDisruptions = NO_DISRUPTIONS,
  pins = NO_PINS,
  onApply,
  target,
  open,
  onOpenChange,
  lowGlare = false,
}: {
  instance: Ps1Instance;
  submission: Submission;
  network: Network;
  existingDisruptions?: Disruption[];
  pins?: Pin[];
  onApply: (outcome: ReplanOutcome, disruptions: Disruption[], diagnostics: SolveDiagnostics) => void;
  /** A location-week chosen in the timeline, which seeds this panel. */
  target?: { locationId: string; week: number } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lowGlare?: boolean;
}) {
  const timeline = useMemo(
    () => buildTimeline(instance, submission, network, existingDisruptions),
    [instance, submission, network, existingDisruptions],
  );

  // Default to the busiest location-week, which is where a cut hurts most and
  // therefore where the feature is worth demonstrating.
  const busiest = useMemo(() => {
    let best = { locationId: timeline.rows[0]?.locationId ?? "", week: 1, possessions: 0 };
    for (const row of timeline.rows) {
      for (const cell of row.cells.values()) {
        if (cell.possessions > best.possessions) {
          best = { locationId: row.locationId, week: cell.week, possessions: cell.possessions };
        }
      }
    }
    return best;
  }, [timeline]);

  /**
   * Ordered by pressure rather than by position on the line. Cutting a location
   * that is already at capacity is the case worth testing, and it was the one
   * buried deepest in a list of sixty-seven raw ids.
   */
  const options = useMemo(() => {
    const total = (row: (typeof timeline.rows)[number]) =>
      [...row.cells.values()].reduce((sum, cell) => sum + cell.possessions, 0);
    return [...timeline.rows].sort(
      (a, b) => b.peak - a.peak || total(b) - total(a) || a.seq - b.seq,
    );
  }, [timeline]);

  const seed = target ?? busiest;
  const [locationId, setLocationId] = useState(seed.locationId);
  const [fromWeek, setFromWeek] = useState(seed.week);
  const [toWeek, setToWeek] = useState(seed.week);
  // One night fewer than the location actually has. A flat default of 1 is not
  // a cut at all on a capacity-1 location — which is most of the tunnel
  // sections — so the panel opened saying it displaced nothing.
  const [capacity, setCapacity] = useState(() =>
    Math.max(0, capacityAt(network, existingDisruptions, seed.locationId, seed.week) - 1),
  );

  const disruptions: Disruption[] = useMemo(
    () => [...existingDisruptions, { locationId, fromWeek, toWeek, capacity }],
    [existingDisruptions, locationId, fromWeek, toWeek, capacity],
  );
  const [proposal, setProposal] = useState<{
    result: ReplanOutcome;
    diagnostics: SolveDiagnostics;
    basis: Submission;
    disruptions: Disruption[];
    pins: Pin[];
  } | null>(null);
  // Closing the dialog does not unmount it. A preview is only adoptable against
  // the exact applied schedule and cumulative cuts it was computed from.
  const outcome = proposal?.basis === submission && proposal.disruptions === disruptions && proposal.pins === pins
    ? proposal.result
    : null;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const invalidate = () => {
    controllerRef.current?.abort();
    setProposal(null);
    setError(null);
  };
  useEffect(() => () => controllerRef.current?.abort(), [instance, submission, disruptions, pins, open]);

  const impact = useMemo(
    () => assessDisruption(instance, submission, disruptions, network),
    [instance, submission, disruptions, network],
  );

  const replannedReport = useMemo(
    () =>
      outcome ? validate(instance, outcome.submission, network, disruptions) : null,
    [outcome, instance, network, disruptions],
  );

  const nominal = network.supply.get(locationId)?.supplyCapacity ?? 0;
  const validCut = Number.isInteger(fromWeek) && Number.isInteger(toWeek) &&
    fromWeek >= 1 && toWeek >= fromWeek && toWeek <= timeline.weeks.length &&
    Number.isInteger(capacity) && capacity >= 0 && capacity <= nominal;

  const replan = async () => {
    if (running || !validCut) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setError(null);
    setProposal(null);
    try {
      const displaced = new Set(impact.displaced.map((row) => `${row.activityId}|${row.week}`));
      const successors = new Map<string, string[]>();
      for (const activity of instance.activities) {
        if (!activity.predecessorActivityId) continue;
        const next = successors.get(activity.predecessorActivityId) ?? [];
        next.push(activity.activityId);
        successors.set(activity.predecessorActivityId, next);
      }
      const downstream = new Set<string>();
      const queue = [...impact.displacedActivityIds];
      for (let index = 0; index < queue.length; index += 1) {
        for (const activityId of successors.get(queue[index]) ?? []) {
          if (downstream.has(activityId)) continue;
          downstream.add(activityId);
          queue.push(activityId);
        }
      }
      const held = new Map(submission.access
        .filter((row) => !displaced.has(`${row.activityId}|${row.week}`) && !downstream.has(row.activityId))
        .map((row) => [`${row.activityId}|${row.week}`, { activityId: row.activityId, week: row.week, eclo: row.eclo }]));
      // Explicit planner pins remain hard even when the cut touches their access.
      for (const pin of pins) held.set(`${pin.activityId}|${pin.week}`, { ...pin, eclo: pin.eclo ?? 0 });
      const solved = await requestPs1Solve({
        instance, scenario: submission.scenario, pins: [...held.values()], disruptions,
      }, controller.signal);
      controller.signal.throwIfAborted();
      if (solved.status !== "FEASIBLE" || !solved.submission) {
        throw new Error(solved.diagnostics.warnings[0] ?? "No feasible replan was found while holding the unaffected work and your pins. Adjust the cut and try again.");
      }
      const before = new Set(submission.access.map((row) => `${row.activityId}|${row.week}|${row.eclo}`));
      const moved = solved.submission.access.filter((row) => !before.has(`${row.activityId}|${row.week}|${row.eclo}`));
      const unchanged = solved.submission.access.length - moved.length;
      setProposal({
        basis: submission, disruptions, pins, diagnostics: solved.diagnostics,
        result: {
          submission: { ...solved.submission, rejectedPins: solved.diagnostics.rejectedPins },
          impact,
          churn: {
            unchangedAccesses: unchanged, movedAccesses: moved.length,
            movedActivityIds: [...new Set(moved.map((row) => row.activityId))].sort(),
            percentUnchanged: Math.round(1000 * unchanged / Math.max(1, solved.submission.access.length)) / 10,
          },
        },
      });
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The replan could not complete. Please try again.");
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setRunning(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`ps1-dialog ${lowGlare ? "ps1-low-glare" : ""} w-[min(760px,calc(100vw-32px))]`}>
      <DialogTitle>Urgent maintenance</DialogTitle>
      <DialogDescription>
        Cut a location&apos;s nightly quota mid-horizon, see what it displaces, and re-plan around
        it while holding work outside the affected dependency chains.
      </DialogDescription>
      {existingDisruptions.length > 0 && (
        <p className="mt-2 text-[12px] text-ink-700">
          {existingDisruptions.length} applied capacity cut{existingDisruptions.length === 1 ? "" : "s"} will be retained.
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-[12px] text-ink-700">
          Location
          <select
            className="mt-1 block w-full rounded-md border border-rule-strong bg-surface px-2 py-1.5 text-[12px] text-ink-900"
            value={locationId}
            onChange={(event) => {
              setLocationId(event.target.value);
              invalidate();
            }}
          >
            {options.map((row) => (
              <option key={row.locationId} value={row.locationId}>
                {locationDetail(row)}
                {row.peak > 0 ? ` · full in ${row.peak} wk` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] text-ink-700">
          From week
          <input
            type="number"
            min={1}
            max={timeline.weeks.length}
            className="mt-1 block w-full rounded-md border border-rule-strong bg-surface px-2 py-1.5 text-[12px] tabular-nums text-ink-900"
            value={fromWeek}
            onChange={(event) => {
              const week = Number(event.target.value);
              setFromWeek(week);
              if (week > toWeek) setToWeek(week);
              invalidate();
            }}
          />
        </label>
        <label className="text-[12px] text-ink-700">
          To week
          <input
            type="number"
            min={fromWeek}
            max={timeline.weeks.length}
            className="mt-1 block w-full rounded-md border border-rule-strong bg-surface px-2 py-1.5 text-[12px] tabular-nums text-ink-900"
            value={toWeek}
            onChange={(event) => {
              setToWeek(Number(event.target.value));
              invalidate();
            }}
          />
        </label>
        <label className="text-[12px] text-ink-700">
          Reduced to (nominal {nominal})
          <input
            type="number"
            min={0}
            max={nominal}
            className="mt-1 block w-full rounded-md border border-rule-strong bg-surface px-2 py-1.5 text-[12px] tabular-nums text-ink-900"
            value={capacity}
            onChange={(event) => {
              setCapacity(Number(event.target.value));
              invalidate();
            }}
          />
        </label>
      </div>

      <div className="mt-3 rounded-md border border-rule bg-sunk p-3">
        <p className="text-[12px] font-semibold text-ink-900">
          {impact.affected.length === 0
            ? "This cut displaces nothing — the location has room at that capacity."
            : `${impact.affected.length} location-week${impact.affected.length === 1 ? "" : "s"} no longer fit, displacing ${impact.displaced.length} access${impact.displaced.length === 1 ? "" : "es"} across ${impact.displacedActivityIds.length} activit${impact.displacedActivityIds.length === 1 ? "y" : "ies"}.`}
        </p>
        {impact.displaced.length > 0 && (
          <ul className="mt-2 grid gap-1 text-[11px] text-ink-700">
            {impact.displaced.slice(0, 6).map((entry) => (
              <li key={`${entry.activityId}|${entry.week}`}>
                <span className="text-ink-900">{entry.activityId}</span> ({entry.contractNumber}) —{" "}
                {entry.reason}
              </li>
            ))}
            {impact.displaced.length > 6 && (
              <li className="text-ink-400">and {impact.displaced.length - 6} more</li>
            )}
          </ul>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-x-5 gap-y-3">
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="primary"
            disabled={running || !validCut || impact.displaced.length === 0}
            aria-busy={running}
            aria-describedby="ps1-note-replan"
            onClick={() => void replan()}
          >
            Re-plan around it
          </Button>
          <ActionNote id="ps1-note-replan">
            {impact.displaced.length === 0
              ? "Nothing to re-plan — choose a location-week where the cut actually displaces work."
              : "Replans on the server under the reduced quota. Displaced work and its successors can move; other accesses and your explicit pins are held. Review the result before applying it."}
          </ActionNote>
        </div>
        {outcome && (
          <div className="flex flex-col items-start gap-1">
            <Button disabled={running || !replannedReport?.feasible} aria-describedby="ps1-note-adopt" onClick={() => proposal && onApply(outcome, disruptions, proposal.diagnostics)}>
              Adopt this schedule
            </Button>
            <ActionNote id="ps1-note-adopt">
              {replannedReport?.feasible
                ? "Sends this validated proposal to the review shelf. The current scenario and exports stay unchanged until you apply it."
                : "This replan is not locally conformant, so it cannot be adopted."}
            </ActionNote>
          </div>
        )}
      </div>

      {running && <p className="mt-3 text-[12px] text-ink-700" role="status">Replanning on the server while preserving unaffected work and your pins…</p>}
      {!validCut && <p className="mt-3 text-[12px] text-signal-red" role="alert">Choose whole weeks within the horizon and a capacity between 0 and {nominal}.</p>}
      {error && <p className="mt-3 text-[12px] text-signal-red" role="alert">{error}</p>}

      {outcome && (
        <div className="mt-3 rounded-md border border-rule bg-sunk p-3">
          <dl className="grid gap-x-6 gap-y-1 text-[12px] sm:grid-cols-4">
            <div>
              <dt className="text-ink-700">Held still</dt>
              <dd className="font-semibold tabular-nums text-signal-green">
                {outcome.churn.percentUnchanged}%
              </dd>
            </div>
            <div>
              <dt className="text-ink-700">Accesses moved</dt>
              <dd className="font-semibold tabular-nums text-ink-900">
                {outcome.churn.movedAccesses}
              </dd>
            </div>
            <div>
              <dt className="text-ink-700">Activities touched</dt>
              <dd className="font-semibold tabular-nums text-ink-900">
                {outcome.churn.movedActivityIds.length}
              </dd>
            </div>
            <div>
              <dt className="text-ink-700">Still feasible</dt>
              <dd
                className={`font-semibold ${
                  replannedReport?.feasible ? "text-signal-green" : "text-signal-red"
                }`}
              >
                {replannedReport?.feasible ? "yes" : `${replannedReport?.hardViolations.length} violations`}
              </dd>
            </div>
          </dl>
          {outcome.churn.movedActivityIds.length > 0 && (
            <p className="mt-2 text-[11px] text-ink-700">
              Moved: {outcome.churn.movedActivityIds.join(", ")}
            </p>
          )}
          {outcome.submission.rejectedPins.length > 0 && (
            <p className="mt-2 text-[11px] text-signal-amber">
              {outcome.submission.rejectedPins.length} previously-placed access
              {outcome.submission.rejectedPins.length === 1 ? "" : "es"} could not be held and were
              re-placed.
            </p>
          )}
        </div>
      )}
      </DialogContent>
    </Dialog>
  );
}
