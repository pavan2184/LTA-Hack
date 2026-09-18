"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type UIEvent,
} from "react";

import type { Disruption } from "@railplan/ps1/engine/disruption";
import { closureFor, expandSpan, type Network } from "@railplan/ps1/engine/network";
import { buildTimeline, type TimelineCell, type TimelineRow } from "@railplan/ps1/engine/timeline";
import type { Pin } from "@railplan/ps1/engine/schedule";
import type { Ps1Instance, Submission } from "@railplan/ps1/types/ps1";

import { Button } from "@/components/ui/button";
import { locationName } from "@/components/ps1/location";
import type { WorkspaceSelection } from "@/components/ps1/workspace-types";

type Filter = "capacity" | "pinned" | "alpha" | "beta";
type Zoom = "overview" | "standard" | "inspect";

const FILTERS: { id: Filter; label: string; hint: string }[] = [
  { id: "capacity", label: "Bottlenecks", hint: "Only locations at or above capacity" },
  { id: "pinned", label: "Pinned", hint: "Only locations holding pinned work" },
  { id: "alpha", label: "Alpha", hint: "Only Line Alpha" },
  { id: "beta", label: "Beta", hint: "Only Line Beta" },
];

const ZOOM: Record<Zoom, { cell: number; row: number; label: string }> = {
  overview: { cell: 20, row: 24, label: "Overview" },
  standard: { cell: 28, row: 30, label: "Standard" },
  inspect: { cell: 40, row: 38, label: "Inspect" },
};

const VIRTUAL_THRESHOLD = 200;
const OVERSCAN = 8;

/**
 * One-focus, keyboard-operable location-by-week grid. The active descendant
 * model keeps a large matrix out of the page tab order while preserving direct
 * arrow/Home/End navigation and pointer selection.
 */
export function PossessionTimeline({
  instance,
  submission,
  network,
  pins,
  disruptions,
  selection,
  onSelect,
}: {
  instance: Ps1Instance;
  submission: Submission;
  network: Network;
  pins: Pin[];
  disruptions: Disruption[];
  selection: WorkspaceSelection;
  onSelect: (selection: WorkspaceSelection) => void;
}) {
  const timeline = useMemo(
    () => buildTimeline(instance, submission, network, disruptions),
    [disruptions, instance, network, submission],
  );
  const [showEmpty, setShowEmpty] = useState(false);
  const [byLoad, setByLoad] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [zoom, setZoom] = useState<Zoom>("standard");
  const [active, setActive] = useState({ row: 0, column: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(420);
  const gridRef = useRef<HTMLDivElement>(null);

  const pinnedIds = useMemo(
    () => new Set(pins.map((pin) => `${pin.activityId}|${pin.week}`)),
    [pins],
  );
  const selectedActivityId = selection?.kind === "activity" ? selection.activityId : null;
  const selectedAccessWeeks = useMemo(
    () => new Set(
      selectedActivityId
        ? submission.access
            .filter((row) => row.activityId === selectedActivityId)
            .map((row) => row.week)
        : [],
    ),
    [selectedActivityId, submission.access],
  );
  const selectedClosure = useMemo(() => {
    if (!selectedActivityId) return new Set<string>();
    const activity = instance.activities.find((row) => row.activityId === selectedActivityId);
    if (!activity) return new Set<string>();
    const contract = instance.contracts.find(
      (row) => row.contractNumber === activity.contractNumber,
    );
    if (!contract) return new Set<string>();
    return new Set(
      closureFor(
        network,
        expandSpan(network, activity.startLocationId, activity.endLocationId),
        contract.natureOfActivity,
      ),
    );
  }, [instance.activities, instance.contracts, network, selectedActivityId]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    let visible = showEmpty ? [...timeline.rows, ...timeline.emptyRows] : [...timeline.rows];
    if (term) {
      visible = visible.filter(
        (row) =>
          locationName(row).toLowerCase().includes(term) ||
          row.locationId.toLowerCase().includes(term),
      );
    }
    if (filters.includes("capacity")) {
      visible = visible.filter((row) =>
        [...row.cells.values()].some((cell) => cell.load >= 1),
      );
    }
    if (filters.includes("pinned")) {
      visible = visible.filter((row) =>
        [...row.cells.values()].some((cell) =>
          cell.activityIds.some((id) => pinnedIds.has(`${id}|${cell.week}`)),
        ),
      );
    }
    const lines = filters.filter((filter) => filter === "alpha" || filter === "beta");
    if (lines.length === 1) {
      const wanted = lines[0] === "alpha" ? "ALP" : "BET";
      visible = visible.filter((row) => row.lineCode.toUpperCase().startsWith(wanted));
    }
    if (byLoad) {
      const total = (row: TimelineRow) =>
        [...row.cells.values()].reduce((sum, cell) => sum + cell.possessions, 0);
      visible.sort(
        (a, b) => b.peak - a.peak || total(b) - total(a) || a.seq - b.seq,
      );
    }
    return visible;
  }, [byLoad, filters, pinnedIds, query, showEmpty, timeline]);

  useEffect(() => {
    setActive((current) => ({
      row: Math.min(current.row, Math.max(0, rows.length - 1)),
      column: Math.min(current.column, Math.max(0, timeline.weeks.length - 1)),
    }));
  }, [rows.length, timeline.weeks.length]);

  useEffect(() => {
    const element = gridRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight || 420));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const dimensions = ZOOM[zoom];
  const virtual = rows.length > VIRTUAL_THRESHOLD;
  const start = virtual
    ? Math.max(0, Math.floor(scrollTop / dimensions.row) - OVERSCAN)
    : 0;
  const count = virtual
    ? Math.ceil(viewportHeight / dimensions.row) + OVERSCAN * 2
    : rows.length;
  const end = Math.min(rows.length, start + count);
  const visibleRows = rows.slice(start, end);
  const topSpace = start * dimensions.row;
  const bottomSpace = Math.max(0, (rows.length - end) * dimensions.row);
  const activeId = rows.length && timeline.weeks.length
    ? gridCellId(rows[active.row]?.locationId ?? "none", timeline.weeks[active.column])
    : undefined;

  const selectCell = (row: TimelineRow, week: number) => {
    onSelect({ kind: "location-week", locationId: row.locationId, week });
  };

  const moveActive = (nextRow: number, nextColumn: number) => {
    const row = Math.max(0, Math.min(rows.length - 1, nextRow));
    const column = Math.max(0, Math.min(timeline.weeks.length - 1, nextColumn));
    setActive({ row, column });
    const element = gridRef.current;
    if (element && virtual) {
      const top = row * dimensions.row;
      if (top < element.scrollTop) element.scrollTop = top;
      else if (top + dimensions.row > element.scrollTop + element.clientHeight) {
        element.scrollTop = top - element.clientHeight + dimensions.row;
      }
    }
    const targetRow = rows[row];
    if (targetRow) selectCell(targetRow, timeline.weeks[column]);
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!rows.length || !timeline.weeks.length) return;
    let row = active.row;
    let column = active.column;
    if (event.key === "ArrowUp") row -= 1;
    else if (event.key === "ArrowDown") row += 1;
    else if (event.key === "ArrowLeft") column -= 1;
    else if (event.key === "ArrowRight") column += 1;
    else if (event.key === "Home") {
      column = 0;
      if (event.ctrlKey) row = 0;
    }
    else if (event.key === "End") {
      column = timeline.weeks.length - 1;
      if (event.ctrlKey) row = rows.length - 1;
    }
    else if (event.key === "Enter" || event.key === " ") {
      const targetRow = rows[row];
      selectCell(targetRow, timeline.weeks[column]);
      event.preventDefault();
      return;
    }
    else return;
    event.preventDefault();
    moveActive(row, column);
  };

  const toggle = (id: Filter) =>
    setFilters((current) =>
      current.includes(id) ? current.filter((filter) => filter !== id) : [...current, id],
    );
  const hotspots = timeline.rows.filter((row) => row.peak > 0).length;

  return (
    <section className="min-w-0" aria-labelledby="ps1-timeline-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 id="ps1-timeline-title" className="text-[14px] font-semibold text-ink-900">
            Location × week timeline
          </h3>
          <p className="text-[11px] text-ink-500">
            {hotspots} locations reach capacity · arrow keys move the active cell
          </p>
        </div>
        <label className="flex items-center gap-1 text-[11px] text-ink-700">
          Zoom
          <select
            value={zoom}
            onChange={(event) => setZoom(event.target.value as Zoom)}
            className="h-7 rounded-sm border border-rule-strong bg-surface px-1.5 text-[11px]"
          >
            {(Object.keys(ZOOM) as Zoom[]).map((value) => (
              <option key={value} value={value}>{ZOOM[value].label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a location…"
          aria-label="Find a location"
          className="h-7 w-44 rounded-sm border border-rule-strong bg-surface px-2 text-[12px]"
        />
        {FILTERS.map((filter) => (
          <Button
            key={filter.id}
            size="sm"
            title={filter.hint}
            aria-pressed={filters.includes(filter.id)}
            onClick={() => toggle(filter.id)}
          >
            {filter.label}
          </Button>
        ))}
        <Button size="sm" aria-pressed={byLoad} onClick={() => setByLoad((value) => !value)}>
          {byLoad ? "Along the line" : "Busiest first"}
        </Button>
        <Button size="sm" aria-pressed={showEmpty} onClick={() => setShowEmpty((value) => !value)}>
          {showEmpty ? "Hide unused" : `Show ${timeline.emptyRows.length} unused`}
        </Button>
        <span className="ml-auto text-[11px] text-ink-400" role="status">
          {rows.length} location{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-sm border border-rule bg-sunk p-4 text-[12px] text-ink-700">
          No location matches.{" "}
          <button type="button" className="underline" onClick={() => { setQuery(""); setFilters([]); }}>
            Clear filters
          </button>
        </p>
      ) : (
        <div
          ref={gridRef}
          role="grid"
          tabIndex={0}
          aria-label="Possessions per location per week"
          aria-rowcount={rows.length + 1}
          aria-colcount={timeline.weeks.length + 1}
          aria-activedescendant={activeId}
          onKeyDown={onGridKeyDown}
          onScroll={(event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop)}
          className="ps1-timeline-grid mt-3 max-h-[34rem] overflow-auto rounded-sm border border-rule focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <div role="row" aria-rowindex={1} className="sticky top-0 z-30 flex w-max bg-surface">
            <div
              role="columnheader"
              className="sticky left-0 z-40 flex w-52 shrink-0 items-center border-b border-r border-rule bg-surface px-2 text-[11px] font-medium text-ink-700"
              style={{ height: dimensions.row }}
            >
              Location
            </div>
            {timeline.weeks.map((week) => (
              <div
                key={week}
                role="columnheader"
                className="flex shrink-0 items-center justify-center border-b border-rule text-[10px] tabular-nums text-ink-500"
                style={{ width: dimensions.cell, height: dimensions.row }}
              >
                {zoom !== "overview" || week % 5 === 0 ? week : ""}
              </div>
            ))}
          </div>
          {topSpace > 0 && <div aria-hidden style={{ height: topSpace }} />}
          {visibleRows.map((row, offset) => {
            const rowIndex = start + offset;
            return (
              <div
                key={row.locationId}
                role="row"
                aria-rowindex={rowIndex + 2}
                className="flex w-max"
                style={{ height: dimensions.row }}
              >
                <div
                  role="rowheader"
                  className={`sticky left-0 z-20 flex w-52 shrink-0 items-center border-b border-r border-rule px-2 text-[10px] text-ink-900 ${lineGutter(row.lineCode) ?? "bg-surface"}`}
                >
                  <span className="truncate">
                    <span className="text-ink-400">{row.lineCode}</span> {row.label}{" "}
                    <span className="text-ink-400">{row.bound} · cap {row.capacity}</span>
                  </span>
                </div>
                {timeline.weeks.map((week, columnIndex) => {
                  const cell = row.cells.get(week);
                  const isActive = active.row === rowIndex && active.column === columnIndex;
                  const isSelected = selection?.kind === "location-week" && selection.locationId === row.locationId && selection.week === week;
                  const containsSelected = Boolean(selectedActivityId && cell?.activityIds.includes(selectedActivityId));
                  const closureOnly = Boolean(selectedActivityId && selectedAccessWeeks.has(week) && selectedClosure.has(row.locationId) && !containsSelected);
                  const pinned = cell?.activityIds.some((id) => pinnedIds.has(`${id}|${week}`));
                  const over = Boolean(cell && cell.load > 1);
                  const label = `${locationName(row)} week ${week}, ${cell?.possessions ?? 0} of ${cell?.effectiveCapacity ?? row.capacity} possessions${cell?.disrupted ? `, disrupted from ${cell.nominalCapacity}` : ""}${pinned ? ", pinned" : ""}${over ? ", over capacity" : ""}`;
                  return (
                    <div
                      key={week}
                      id={gridCellId(row.locationId, week)}
                      role="gridcell"
                      aria-selected={isSelected || containsSelected}
                      aria-label={label}
                      title={label}
                      onClick={() => {
                        setActive({ row: rowIndex, column: columnIndex });
                        selectCell(row, week);
                        gridRef.current?.focus();
                      }}
                      className={`relative shrink-0 cursor-pointer border-b border-rule/40 ${week % 5 === 0 ? "border-r border-r-rule" : ""} ${over ? "bar-conflict" : ""} ${pinned ? "bar-pinned" : ""} ${cell?.disrupted ? "ps1-cell-disrupted" : ""} ${closureOnly ? "ps1-cell-closure" : ""} ${containsSelected ? "ring-2 ring-inset ring-accent" : ""} ${isActive ? "outline-2 -outline-offset-2 outline-ink-900" : ""}`}
                      style={{
                        width: dimensions.cell,
                        height: dimensions.row,
                        backgroundColor: cell
                          ? over
                            ? "var(--color-signal-red)"
                            : shade(cell.load)
                          : "transparent",
                      }}
                    >
                      {cell?.disrupted && <span className="sr-only">Disrupted capacity.</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {bottomSpace > 0 && <div aria-hidden style={{ height: bottomSpace }} />}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-500">
        <span>Darker = fuller</span>
        <span><span className="bar-conflict mr-1 inline-block h-2.5 w-2.5" />Over capacity</span>
        <span><span className="bar-pinned mr-1 inline-block h-2.5 w-2.5" />Pinned</span>
        <span><span className="ps1-cell-disrupted mr-1 inline-block h-2.5 w-2.5" />Disrupted</span>
        <span><span className="ps1-cell-closure mr-1 inline-block h-2.5 w-2.5" />Closure/buffer</span>
        {virtual && <span className="ml-auto">Virtualized · {rows.length} rows</span>}
      </div>
    </section>
  );
}

function gridCellId(locationId: string, week: number): string {
  return `ps1-grid-${locationId.replace(/[^a-z0-9_-]/gi, "-")}-w${week}`;
}

function lineGutter(lineCode: string): string | null {
  const code = lineCode.toUpperCase();
  if (code.startsWith("ALP")) return "gutter-alpha";
  if (code.startsWith("BET")) return "gutter-beta";
  return null;
}

function shade(load: number): string {
  const clamped = Number.isFinite(load) ? Math.max(0, Math.min(1, load)) : 1;
  const alpha = 0.18 + clamped * 0.72;
  return `color-mix(in oklab, var(--color-accent) ${Math.round(alpha * 100)}%, transparent)`;
}
