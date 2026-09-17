"use client";

import { useMemo, useState } from "react";

import {
  assessDisruption,
  replanForDisruption,
  type Disruption,
  type ReplanOutcome,
} from "@railplan/ps1/engine/disruption";
import { buildTimeline } from "@railplan/ps1/engine/timeline";
import { validate } from "@railplan/ps1/engine/validate";
import type { Network } from "@railplan/ps1/engine/network";
import type { Ps1Instance, Submission } from "@railplan/ps1/types/ps1";

import { Button } from "@/components/ui/button";

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
  onApply,
}: {
  instance: Ps1Instance;
  submission: Submission;
  network: Network;
  onApply: (outcome: ReplanOutcome, disruptions: Disruption[]) => void;
}) {
  const timeline = useMemo(
    () => buildTimeline(instance, submission, network),
    [instance, submission, network],
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

  const [locationId, setLocationId] = useState(busiest.locationId);
  const [fromWeek, setFromWeek] = useState(busiest.week);
  const [toWeek, setToWeek] = useState(busiest.week);
  const [capacity, setCapacity] = useState(1);
  const [outcome, setOutcome] = useState<ReplanOutcome | null>(null);

  const disruptions: Disruption[] = useMemo(
    () => [{ locationId, fromWeek, toWeek, capacity }],
    [locationId, fromWeek, toWeek, capacity],
  );

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

  return (
    <section className="mt-6 rounded-lg border border-rule bg-surface p-4">
      <h3 className="text-[13px] font-semibold text-ink-900">Urgent maintenance</h3>
      <p className="mt-1 text-[12px] text-ink-700">
        Cut a location&apos;s nightly quota mid-horizon, see what it displaces, and re-plan around
        it while holding everything it did not touch.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-[12px] text-ink-700">
          Location
          <select
            className="mt-1 block w-full rounded-md border border-rule-strong bg-surface px-2 py-1.5 text-[12px] text-ink-900"
            value={locationId}
            onChange={(event) => {
              setLocationId(event.target.value);
              setOutcome(null);
            }}
          >
            {timeline.rows.map((row) => (
              <option key={row.locationId} value={row.locationId}>
                {row.locationId} (cap {row.capacity})
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
              setOutcome(null);
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
              setOutcome(null);
            }}
          />
        </label>
        <label className="text-[12px] text-ink-700">
          Reduced to (from {nominal})
          <input
            type="number"
            min={0}
            max={nominal}
            className="mt-1 block w-full rounded-md border border-rule-strong bg-surface px-2 py-1.5 text-[12px] tabular-nums text-ink-900"
            value={capacity}
            onChange={(event) => {
              setCapacity(Number(event.target.value));
              setOutcome(null);
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

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={impact.displaced.length === 0}
          onClick={() => setOutcome(replanForDisruption(instance, submission, disruptions, network))}
        >
          Re-plan around it
        </Button>
        {outcome && (
          <Button onClick={() => onApply(outcome, disruptions)}>Adopt this schedule</Button>
        )}
      </div>

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
    </section>
  );
}
