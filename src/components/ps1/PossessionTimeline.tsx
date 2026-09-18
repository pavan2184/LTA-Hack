"use client";

import { useMemo, useState } from "react";

import { buildTimeline, type TimelineCell, type TimelineRow } from "@railplan/ps1/engine/timeline";
import { explainPlacement } from "@railplan/ps1/engine/explain";
import type { Network } from "@railplan/ps1/engine/network";
import type { Pin } from "@railplan/ps1/engine/schedule";
import type { Ps1Instance, Submission } from "@railplan/ps1/types/ps1";

import { Button } from "@/components/ui/button";
import { ActionNote } from "@/components/ps1/ActionNote";
import { locationDetail, locationName } from "@/components/ps1/location";

type Filter = "capacity" | "pinned" | "alpha" | "beta";

const FILTERS: { id: Filter; label: string; hint: string }[] = [
  { id: "capacity", label: "At capacity", hint: "Only locations that fill up in some week" },
  { id: "pinned", label: "Pinned", hint: "Only locations holding a week you pinned" },
  { id: "alpha", label: "Alpha", hint: "Only Line Alpha" },
  { id: "beta", label: "Beta", hint: "Only Line Beta" },
];

/**
 * Locations down, weeks across, cell shaded by how full the location is.
 *
 * A works controller does not read a schedule as a list of rows; they read it
 * as a shape, and congestion is visible as a dark band long before it is
 * visible as a number.
 *
 * The frame around that grid follows what scheduling tools converge on: a
 * toolbar that narrows the rows (search, and filters for the states worth
 * focusing on), and a detail region that is *beside* the grid rather than
 * beneath it. The old layout opened a panel below a scrolling table, so
 * clicking a cell near the top pushed the page and left the thing you were
 * reading about off screen. Master-detail keeps both in view at once.
 */
export function PossessionTimeline({
  instance,
  submission,
  network,
  pins,
  onPin,
  onClearPins,
  onCut,
  selectedActivityId,
  onSelectActivity,
}: {
  instance: Ps1Instance;
  submission: Submission;
  network: Network;
  pins: Pin[];
  onPin: (pin: Pin) => void;
  onClearPins: () => void;
  /** Send a location-week to urgent maintenance as its target. */
  onCut: (target: { locationId: string; week: number }) => void;
  selectedActivityId?: string | null;
  onSelectActivity?: (activityId: string) => void;
}) {
  const timeline = useMemo(
    () => buildTimeline(instance, submission, network),
    [instance, submission, network],
  );
  const [showEmpty, setShowEmpty] = useState(false);
  const [byLoad, setByLoad] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [selected, setSelected] = useState<{ row: TimelineRow; cell: TimelineCell } | null>(null);

  const pinnedIds = useMemo(
    () => new Set(pins.map((pin) => `${pin.activityId}|${pin.week}`)),
    [pins],
  );

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    let visible = showEmpty ? [...timeline.rows, ...timeline.emptyRows] : timeline.rows;

    if (term) {
      // Both forms, because the name is what is on screen and the id is what is
      // in the CSVs someone may be reading alongside.
      visible = visible.filter(
        (row) =>
          locationName(row).toLowerCase().includes(term) ||
          row.locationId.toLowerCase().includes(term),
      );
    }
    if (filters.includes("capacity")) visible = visible.filter((row) => row.peak > 0);
    if (filters.includes("pinned")) {
      visible = visible.filter((row) =>
        [...row.cells.values()].some((cell) =>
          cell.activityIds.some((id) => pinnedIds.has(`${id}|${cell.week}`)),
        ),
      );
    }
    // Alpha and Beta together mean "either", which is the same as neither.
    const lines = filters.filter((f) => f === "alpha" || f === "beta");
    if (lines.length === 1) {
      const wanted = lines[0] === "alpha" ? "ALP" : "BET";
      visible = visible.filter((row) => row.lineCode.toUpperCase().startsWith(wanted));
    }

    if (!byLoad) return visible;
    // Network order is how the line runs and is the right default — a controller
    // reads along the route. It is the wrong order for finding pressure in
    // sixty-seven rows.
    const total = (row: TimelineRow) =>
      [...row.cells.values()].reduce((sum, cell) => sum + cell.possessions, 0);
    return [...visible].sort((a, b) => b.peak - a.peak || total(b) - total(a) || a.seq - b.seq);
  }, [timeline, showEmpty, byLoad, query, filters, pinnedIds]);

  const available = showEmpty ? timeline.rows.length + timeline.emptyRows.length : timeline.rows.length;
  const hotspots = timeline.rows.filter((row) => row.peak > 0).length;
  const toggle = (id: Filter) =>
    setFilters((current) =>
      current.includes(id) ? current.filter((f) => f !== id) : [...current, id],
    );

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[15px] font-semibold text-ink-900">Possession timeline</h3>
        <p className="text-[12px] text-ink-700">
          {hotspots} of {timeline.rows.length} locations reach capacity in some week
        </p>
      </div>

      {/* Controls that only change what you are looking at, kept on one line.
          They carry their description in a tooltip and the live count below,
          rather than a paragraph each — a paragraph per view toggle was louder
          than the grid it was describing. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a location…"
          aria-label="Find a location"
          className="h-7 w-52 rounded-sm border border-rule-strong bg-surface px-2 text-[12px] text-ink-900"
        />
        {FILTERS.map((filter) => (
          <Button
            key={filter.id}
            size="sm"
            title={filter.hint}
            aria-pressed={filters.includes(filter.id)}
            className={filters.includes(filter.id) ? "border-accent bg-accent-soft text-accent" : ""}
            onClick={() => toggle(filter.id)}
          >
            {filter.label}
          </Button>
        ))}
        <span className="mx-1 h-5 w-px bg-rule" aria-hidden />
        <Button
          size="sm"
          aria-pressed={byLoad}
          title="Order rows by weeks at capacity, then by volume"
          onClick={() => setByLoad((value) => !value)}
        >
          {byLoad ? "Along the line" : "Busiest first"}
        </Button>
        <Button
          size="sm"
          aria-pressed={showEmpty}
          title="Include locations this schedule never touches"
          onClick={() => setShowEmpty((value) => !value)}
        >
          {showEmpty ? "Hide unused" : `Show ${timeline.emptyRows.length} unused`}
        </Button>
        {pins.length > 0 && (
          <Button size="sm" onClick={onClearPins} title="Release every pin and re-solve">
            Clear {pins.length} pin{pins.length === 1 ? "" : "s"}
          </Button>
        )}
        <p className="ml-auto text-[11px] text-ink-400" role="status">
          {rows.length === available
            ? `${rows.length} locations`
            : `${rows.length} of ${available} locations`}
          {byLoad ? " · busiest first" : " · along the line"}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-700">
        <span>Load</span>
        {[0.25, 0.5, 0.75, 1].map((load) => (
          <span key={load} className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-xs border border-rule"
              style={{ background: shade(load) }}
            />
            {Math.round(load * 100)}%
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="bar-conflict inline-block h-3 w-3 rounded-xs border border-signal-red bg-signal-red" />
          over capacity
        </span>
        <span className="flex items-center gap-1">
          <span className="bar-pinned inline-block h-3 w-3 rounded-xs border border-accent bg-accent-soft" />
          pinned
        </span>
        <span className="ml-auto flex items-center gap-2 text-ink-400">
          <span className="flex items-center gap-1">
            <span className="gutter-alpha inline-block h-3 w-3 rounded-xs border border-rule" />
            Alpha
          </span>
          <span className="flex items-center gap-1">
            <span className="gutter-beta inline-block h-3 w-3 rounded-xs border border-rule" />
            Beta
          </span>
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1">
          {rows.length === 0 ? (
            <p className="rounded-sm border border-rule bg-sunk p-4 text-[12px] text-ink-700">
              No location matches those filters.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setQuery("");
                  setFilters([]);
                }}
              >
                Clear them
              </button>
              .
            </p>
          ) : (
            <div className="max-h-[26rem] overflow-auto rounded-sm border border-rule">
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
                      {/* The gutter is tinted by line, so sixty-seven rows
                          resolve into two lines before a label is read. */}
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 whitespace-nowrap border-b border-r border-rule px-2 py-0.5 text-left font-normal text-ink-900 ${
                          lineGutter(row.lineCode) ?? "bg-surface"
                        }`}
                      >
                        <span className="text-ink-400">{row.lineCode}</span> {row.label}{" "}
                        <span className="text-ink-400">
                          {row.bound} · {row.kind === "SEC" ? "sector" : "platform"} · cap{" "}
                          {row.capacity}
                        </span>
                      </th>
                      {timeline.weeks.map((week) => {
                        const cell = row.cells.get(week);
                        const over = cell ? cell.load > 1 : false;
                        const isSelected =
                          selected?.row.locationId === row.locationId &&
                          selected.cell.week === week;
                        const pinnedHere = cell?.activityIds.some((id) =>
                          pinnedIds.has(`${id}|${week}`),
                        );
                        const containsSelected = Boolean(
                          selectedActivityId && cell?.activityIds.includes(selectedActivityId),
                        );
                        return (
                          <td
                            key={week}
                            // Every fifth column carries a rule, so the eye can
                            // track a row thirty weeks wide without counting.
                            className={`border-b border-rule/40 p-0 ${
                              week % 5 === 0 ? "border-r border-r-rule" : ""
                            }`}
                          >
                            {cell ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelected({ row, cell });
                                  const activityId =
                                    (selectedActivityId && cell.activityIds.includes(selectedActivityId)
                                      ? selectedActivityId
                                      : cell.activityIds[0]) ?? null;
                                  if (activityId) onSelectActivity?.(activityId);
                                }}
                                aria-pressed={isSelected}
                                title={`${locationName(row)} wk${week}: ${cell.possessions}/${cell.capacity} possessions, ${cell.activityIds.length} activities${pinnedHere ? ", pinned" : ""}`}
                                aria-label={`${locationName(row)} week ${week}, ${cell.possessions} of ${cell.capacity} possessions${pinnedHere ? ", pinned" : ""}${over ? ", over capacity" : ""}`}
                                // Colour is never the only carrier: over
                                // capacity is red AND hatched, a pinned week is
                                // blue AND ruled, as the planner timeline draws
                                // them. Both survive greyscale.
                                className={`block h-4 w-full ${over ? "bar-conflict" : ""} ${
                                  pinnedHere ? "bar-pinned" : ""
                                } ${isSelected ? "outline-2 -outline-offset-1 outline-ink-900" : ""} ${containsSelected ? "ring-2 ring-inset ring-accent" : ""}`}
                                // `backgroundColor`, never the `background`
                                // shorthand: the shorthand resets
                                // background-image and would erase the patterns.
                                style={{
                                  backgroundColor: over
                                    ? "var(--color-signal-red)"
                                    : shade(cell.load),
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
          )}
        </div>

        <aside className="w-full shrink-0 self-start lg:sticky lg:top-3 lg:w-[19rem]">
          {selected ? (
            <CellInspector
              instance={instance}
              submission={submission}
              network={network}
              row={selected.row}
              cell={selected.cell}
              pinnedIds={pinnedIds}
              onPin={onPin}
              onCut={onCut}
              onClose={() => setSelected(null)}
            />
          ) : (
            <div className="rounded-sm border border-dashed border-rule p-4 text-[12px] text-ink-500">
              <p className="font-medium text-ink-700">Nothing selected</p>
              <p className="mt-1.5 leading-snug">
                Click any cell to see which activities hold that location that week, why each one
                is there, and to pin or disrupt it. Darker is fuller.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

/** What one location-week holds, and the two things you can do to it. */
function CellInspector({
  instance,
  submission,
  network,
  row,
  cell,
  pinnedIds,
  onPin,
  onCut,
  onClose,
}: {
  instance: Ps1Instance;
  submission: Submission;
  network: Network;
  row: TimelineRow;
  cell: TimelineCell;
  pinnedIds: Set<string>;
  onPin: (pin: Pin) => void;
  onCut: (target: { locationId: string; week: number }) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-sm border border-rule bg-sunk p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-semibold text-ink-900">
            {locationName(row)} · wk{cell.week}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-700">
            {locationDetail(row).replace(`${locationName(row)} · `, "")}
          </p>
          <p className="font-mono text-[10px] text-ink-400">{row.locationId}</p>
        </div>
        <Button size="sm" variant="quiet" aria-label="Close this location-week" onClick={onClose}>
          Close
        </Button>
      </div>

      <p className="mt-2 border-t border-rule pt-2 text-[11px] text-ink-700">
        {cell.possessions}/{cell.capacity} possessions · {cell.activityIds.length}{" "}
        {cell.activityIds.length === 1 ? "activity" : "activities"}
      </p>

      <ul className="mt-2 grid gap-2">
        {cell.activityIds.map((activityId) => {
          const explanation = explainPlacement(instance, submission, activityId, network);
          const key = `${activityId}|${cell.week}`;
          const pinned = pinnedIds.has(key);
          return (
            <li key={activityId} className="border-t border-rule pt-2 first:border-0 first:pt-0">
              <p className="text-[12px] text-ink-900">
                {activityId}
                <span className="ml-1 text-ink-400">{explanation?.contractNumber}</span>
              </p>
              {explanation && (
                <p className="mt-1 text-[11px] leading-snug text-ink-700">{explanation.summary}</p>
              )}
              <Button
                size="sm"
                className="mt-1.5"
                variant={pinned ? "primary" : "default"}
                aria-describedby={`ps1-note-pin-${key}`}
                onClick={() => onPin({ activityId, week: cell.week })}
              >
                {pinned ? "Pinned here" : "Pin to this week"}
              </Button>
              <ActionNote id={`ps1-note-pin-${key}`}>
                {pinned
                  ? `Releases ${activityId} from wk${cell.week} and re-solves.`
                  : `Holds ${activityId} in wk${cell.week} as a hard constraint and re-solves around it. A pin the rules reject comes back with its reason.`}
              </ActionNote>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-col gap-1 border-t border-rule pt-2">
        <Button
          size="sm"
          aria-describedby="ps1-note-cut"
          onClick={() => onCut({ locationId: row.locationId, week: cell.week })}
        >
          Cut this location-week
        </Button>
        <ActionNote id="ps1-note-cut">
          Opens urgent maintenance aimed at {locationName(row)} wk{cell.week}, rather than at
          something picked out of a list of sixty-seven.
        </ActionNote>
      </div>
    </div>
  );
}

/**
 * A line's gutter tint, or nothing for a line we have no tint for.
 *
 * Two are defined because the published instance has two. A hidden instance
 * with a third line is not a failure: those rows keep the plain surface, which
 * is duller than the others but never wrong. Inventing a colour per line code
 * at runtime would put an unreviewed hue next to the status palette, which is
 * the one thing the colour rules here forbid.
 */
function lineGutter(lineCode: string): string | null {
  const code = lineCode.toUpperCase();
  if (code.startsWith("ALP")) return "gutter-alpha";
  if (code.startsWith("BET")) return "gutter-beta";
  return null;
}

/** Blue at low load through to near-black at capacity, on the accent hue. */
function shade(load: number): string {
  const clamped = Math.max(0, Math.min(1, load));
  // Start visible: an occupied cell at 25% should not look like an empty one.
  const alpha = 0.18 + clamped * 0.72;
  return `color-mix(in oklab, var(--color-accent) ${Math.round(alpha * 100)}%, transparent)`;
}
