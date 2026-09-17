"use client";

import { useMemo, useState } from "react";

import { buildTimeline, type TimelineCell } from "@railplan/ps1/engine/timeline";
import { explainPlacement } from "@railplan/ps1/engine/explain";
import type { Network } from "@railplan/ps1/engine/network";
import type { Pin } from "@railplan/ps1/engine/schedule";
import type { Ps1Instance, Submission } from "@railplan/ps1/types/ps1";

import { Button } from "@/components/ui/button";

/**
 * Locations down, weeks across, cell shaded by how full the location is.
 *
 * A works controller does not read a schedule as a list of rows; they read it
 * as a shape, and congestion is visible as a dark band long before it is
 * visible as a number. Clicking a cell opens what is in it and why.
 */
export function PossessionTimeline({
  instance,
  submission,
  network,
  pins,
  onPin,
  onClearPins,
}: {
  instance: Ps1Instance;
  submission: Submission;
  network: Network;
  pins: Pin[];
  onPin: (pin: Pin) => void;
  onClearPins: () => void;
}) {
  const timeline = useMemo(
    () => buildTimeline(instance, submission, network),
    [instance, submission, network],
  );
  const [showEmpty, setShowEmpty] = useState(false);
  const [selected, setSelected] = useState<{ locationId: string; cell: TimelineCell } | null>(null);

  const rows = showEmpty ? [...timeline.rows, ...timeline.emptyRows] : timeline.rows;
  const pinnedIds = new Set(pins.map((pin) => `${pin.activityId}|${pin.week}`));

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-ink-900">Possession timeline</h3>
          <p className="mt-1 text-[12px] text-ink-700">
            {timeline.rows.length} locations in use across {timeline.weeks.length} weeks. Darker is
            fuller; click a cell to see what is in it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pins.length > 0 && (
            <Button size="sm" onClick={onClearPins}>
              Clear {pins.length} pin{pins.length === 1 ? "" : "s"}
            </Button>
          )}
          <Button size="sm" onClick={() => setShowEmpty((value) => !value)}>
            {showEmpty ? "Hide unused locations" : `Show ${timeline.emptyRows.length} unused`}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-700">
        <span>Load</span>
        {[0.25, 0.5, 0.75, 1].map((load) => (
          <span key={load} className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-rule"
              style={{ background: shade(load) }}
            />
            {Math.round(load * 100)}%
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm border border-signal-red bg-signal-red" />
          over capacity
        </span>
      </div>

      <div className="mt-3 max-h-[26rem] overflow-auto rounded-md border border-rule">
        <table className="border-collapse text-[11px]">
          <caption className="sr-only">
            Possessions per location per week. Each cell shows possessions opened against the
            location&apos;s capacity.
          </caption>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 border-b border-r border-rule bg-surface px-2 py-1 text-left font-medium text-ink-700"
              >
                Location
              </th>
              {timeline.weeks.map((week) => (
                <th
                  key={week}
                  scope="col"
                  className="border-b border-rule px-0 py-1 text-center font-normal tabular-nums text-ink-400"
                  style={{ minWidth: 18 }}
                >
                  {week % 5 === 0 ? week : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.locationId}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-rule bg-surface px-2 py-0.5 text-left font-normal text-ink-900"
                >
                  <span className="text-ink-400">{row.lineCode}</span> {row.label}{" "}
                  <span className="text-ink-400">
                    {row.bound} · {row.kind === "SEC" ? "sector" : "platform"} · cap {row.capacity}
                  </span>
                </th>
                {timeline.weeks.map((week) => {
                  const cell = row.cells.get(week);
                  const over = cell ? cell.load > 1 : false;
                  return (
                    <td key={week} className="border-b border-rule/40 p-0">
                      {cell ? (
                        <button
                          type="button"
                          onClick={() => setSelected({ locationId: row.locationId, cell })}
                          title={`${row.locationId} wk${week}: ${cell.possessions}/${cell.capacity} possessions, ${cell.activityIds.length} activities`}
                          aria-label={`${row.locationId} week ${week}, ${cell.possessions} of ${cell.capacity} possessions`}
                          className="block h-4 w-full"
                          style={{
                            background: over ? "var(--color-signal-red)" : shade(cell.load),
                          }}
                        />
                      ) : (
                        <span className="block h-4 w-full" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="mt-3 rounded-md border border-rule bg-sunk p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12px] font-semibold text-ink-900">
              {selected.locationId} · wk{selected.cell.week}
            </p>
            <p className="text-[11px] text-ink-700">
              {selected.cell.possessions}/{selected.cell.capacity} possessions ·{" "}
              {selected.cell.activityIds.length} activities
            </p>
          </div>
          <ul className="mt-2 grid gap-2">
            {selected.cell.activityIds.map((activityId) => {
              const explanation = explainPlacement(instance, submission, activityId, network);
              const key = `${activityId}|${selected.cell.week}`;
              return (
                <li key={activityId} className="border-t border-rule pt-2 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[12px] text-ink-900">
                      {activityId}
                      <span className="ml-1 text-ink-400">{explanation?.contractNumber}</span>
                    </span>
                    <Button
                      size="sm"
                      variant={pinnedIds.has(key) ? "primary" : "default"}
                      onClick={() => onPin({ activityId, week: selected.cell.week })}
                    >
                      {pinnedIds.has(key) ? "Pinned here" : "Pin to this week"}
                    </Button>
                  </div>
                  {explanation && (
                    <p className="mt-1 text-[11px] text-ink-700">{explanation.summary}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Blue at low load through to near-black at capacity, on the accent hue. */
function shade(load: number): string {
  const clamped = Math.max(0, Math.min(1, load));
  // Start visible: an occupied cell at 25% should not look like an empty one.
  const alpha = 0.18 + clamped * 0.72;
  return `color-mix(in oklab, var(--color-accent) ${Math.round(alpha * 100)}%, transparent)`;
}
