"use client";

import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Pin as PinIcon, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import type { Pin } from "@railplan/ps1/engine/schedule";
import { weekEnd, weekOf, weekStart } from "@railplan/ps1/engine/validate";
import { ECLO_YIELD, STANDARD_YIELD, type AccessRow, type Activity, type Contract, type PlanDiff, type Ps1Instance, type Submission } from "@railplan/ps1/types/ps1";
import type { WorkspaceSelection } from "./workspace-types";

import "./work-schedule.css";

const EMPTY_PINS: Pin[] = [];
const WEEK_WIDTHS = { compact: 30, standard: 46, detail: 72 };
type Zoom = keyof typeof WEEK_WIDTHS;
type Filter = "all" | "late" | "pinned" | "changed";
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

interface WorkRow {
  activity: Activity;
  accesses: AccessRow[];
  first: number;
  last: number;
  delivered: number;
  lateDays: number;
}

export interface WorkScheduleProps {
  instance: Ps1Instance;
  submission: Submission;
  selection: WorkspaceSelection;
  onSelect: (selection: WorkspaceSelection) => void;
  pins?: Pin[];
  diff?: PlanDiff | null;
}

/** Weekly access marks are discrete facts; only contract rows draw summary spans. */
export function WorkSchedule({ instance, submission, selection, onSelect, pins = EMPTY_PINS, diff = null }: WorkScheduleProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [zoom, setZoom] = useState<Zoom>("standard");
  const [viewport, setViewport] = useState({ left: 0, width: 680 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLTableCellElement>(null);
  const activityRefs = useRef(new Map<string, HTMLButtonElement>());
  const accessRefs = useRef(new Map<string, HTMLButtonElement>());
  const horizon = instance.parameters.horizonWeeks;
  const weekWidth = WEEK_WIDTHS[zoom];
  const timelineWidth = horizon * weekWidth;
  const weeks = useMemo(() => Array.from({ length: horizon }, (_, i) => i + 1), [horizon]);
  const pinnedIds = useMemo(() => new Set(pins.map((pin) => pin.activityId)), [pins]);
  const pinnedWeeks = useMemo(() => new Set(pins.map((pin) => `${pin.activityId}|${pin.week}`)), [pins]);
  const changedIds = useMemo(() => new Set(diff?.movedActivityIds ?? []), [diff]);
  const results = useMemo(() => new Map(submission.results.map((result) => [result.contractNumber, result])), [submission.results]);

  const groups = useMemo(() => {
    const accesses = new Map<string, AccessRow[]>();
    for (const row of submission.access) {
      const current = accesses.get(row.activityId) ?? [];
      current.push(row);
      accesses.set(row.activityId, current);
    }
    const grouped = new Map<string, WorkRow[]>();
    const contracts = new Map(instance.contracts.map((contract) => [contract.contractNumber, contract]));
    for (const activity of instance.activities) {
      const scheduled = (accesses.get(activity.activityId) ?? []).toSorted((a, b) => a.week - b.week);
      const contract = contracts.get(activity.contractNumber);
      const last = scheduled.at(-1)?.week ?? 0;
      const lateDays = contract && last
        ? Math.max(0, Math.round((weekEnd(instance.parameters.horizonStart, last).getTime() - new Date(`${contract.plannedCompletionDate}T00:00:00Z`).getTime()) / 86_400_000))
        : 0;
      const row: WorkRow = {
        activity,
        accesses: scheduled,
        first: scheduled[0]?.week ?? 0,
        last,
        delivered: scheduled.reduce((sum, access) => sum + (access.eclo ? ECLO_YIELD : STANDARD_YIELD), 0),
        lateDays,
      };
      const current = grouped.get(activity.contractNumber) ?? [];
      current.push(row);
      grouped.set(activity.contractNumber, current);
    }
    return instance.contracts.map((contract) => ({ contract, rows: grouped.get(contract.contractNumber) ?? [] }));
  }, [instance, submission.access]);

  const visibleGroups = useMemo(() => {
    const term = query.trim().toLowerCase();
    return groups.flatMap(({ contract, rows }) => {
      const matching = rows.filter(({ activity, lateDays }) => {
        if (filter === "late" && lateDays === 0) return false;
        if (filter === "pinned" && !pinnedIds.has(activity.activityId)) return false;
        if (filter === "changed" && !changedIds.has(activity.activityId)) return false;
        return !term || [contract.contractNumber, contract.contractDescription, activity.activityId, activity.activityType, activity.startLocationId, activity.endLocationId].some((value) => value.toLowerCase().includes(term));
      });
      return matching.length ? [{ contract, rows: matching }] : [];
    });
  }, [changedIds, filter, groups, pinnedIds, query]);
  const visibleCount = visibleGroups.reduce((count, group) => count + group.rows.length, 0);
  const navigableIds = visibleGroups.flatMap(({ contract, rows }) => collapsed.has(contract.contractNumber) ? [] : rows.map((row) => row.activity.activityId));

  const selectedIds = useMemo(() => {
    if (selection?.kind === "activity") return new Set([selection.activityId]);
    if (selection?.kind === "location-week") {
      return new Set(submission.occupancy.filter((row) => row.locationId === selection.locationId && row.week === selection.week).map((row) => row.activityId));
    }
    return new Set<string>();
  }, [selection, submission.occupancy]);

  const focusableActivityId = navigableIds.find((id) => selectedIds.has(id)) ?? navigableIds[0];

  const overview = useMemo(() => {
    const counts = Array.from({ length: horizon }, () => 0);
    for (const group of visibleGroups) for (const row of group.rows) for (const access of row.accesses) {
      if (access.week >= 1 && access.week <= horizon) counts[access.week - 1] += 1;
    }
    return counts;
  }, [horizon, visibleGroups]);
  const peak = Math.max(1, ...overview);
  const visibleWeeks = Math.max(1, Math.min(horizon, viewport.width / weekWidth));
  const firstWeek = Math.min(horizon, Math.floor(viewport.left / weekWidth) + 1);
  const lastWeek = Math.min(horizon, Math.ceil((viewport.left + viewport.width) / weekWidth));
  const maxFirstWeek = Math.max(1, Math.ceil(horizon - visibleWeeks + 1));

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const labelWidth = labelRef.current?.getBoundingClientRect().width ?? 310;
      setViewport({ left: scroll.scrollLeft, width: Math.max(1, scroll.clientWidth - labelWidth) });
    });
    observer.observe(scroll);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const selected = selection?.kind === "activity" ? activityRefs.current.get(selection.activityId) : null;
    const scroll = scrollRef.current;
    if (!selected || !scroll) return;
    const row = selected.closest("tr");
    if (!row) return;
    const top = row.offsetTop;
    if (top < scroll.scrollTop + 54) scroll.scrollTop = Math.max(0, top - 54);
    else if (top + row.offsetHeight > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = top + row.offsetHeight - scroll.clientHeight;
  }, [selection]);

  function goToWeek(week: number) {
    const left = Math.max(0, Math.min((week - 1) * weekWidth, timelineWidth - viewport.width));
    if (scrollRef.current) scrollRef.current.scrollLeft = left;
    setViewport((value) => ({ ...value, left }));
  }

  function toggleContract(id: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function navigateActivity(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const index = navigableIds.indexOf(id);
    let next = index;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const firstAccess = groups.flatMap((group) => group.rows).find((row) => row.activity.activityId === id)?.accesses[0];
      if (firstAccess) accessRefs.current.get(`${id}|${firstAccess.week}`)?.focus();
      return;
    }
    if (event.key === "ArrowDown") next += 1;
    else if (event.key === "ArrowUp") next -= 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = navigableIds.length - 1;
    else return;
    event.preventDefault();
    const nextId = navigableIds[Math.max(0, Math.min(navigableIds.length - 1, next))];
    if (nextId) {
      activityRefs.current.get(nextId)?.focus();
      onSelect({ kind: "activity", activityId: nextId });
    }
  }

  function navigateAccess(event: KeyboardEvent<HTMLButtonElement>, activityId: string, accesses: AccessRow[], index: number) {
    if (event.key === "Escape" || (event.key === "ArrowLeft" && index === 0)) {
      event.preventDefault();
      activityRefs.current.get(activityId)?.focus();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = accesses[Math.max(0, Math.min(accesses.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)))];
      if (next) accessRefs.current.get(`${activityId}|${next.week}`)?.focus();
    } else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      navigateActivity(event, activityId);
    }
  }

  function clearFilters() {
    setQuery("");
    setFilter("all");
  }

  return (
    <section className="ps1-work-schedule" aria-label="Work schedule">
      <div className="ps1-work-controls">
        <label className="ps1-work-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="Find contract or activity" placeholder="Find contract, activity or location" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label className="ps1-work-filter"><span className="sr-only">Activity filter</span><select aria-label="Activity filter" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">All activities</option><option value="late">Past planned date</option><option value="pinned">Pinned work</option>{diff && <option value="changed">Changed work</option>}</select></label>
        <div className="ps1-work-expand-controls"><button type="button" title="Expand all contracts" aria-label="Expand all contracts" onClick={() => setCollapsed(new Set())}><ChevronsUpDown size={15} /></button><button type="button" title="Collapse all contracts" aria-label="Collapse all contracts" onClick={() => setCollapsed(new Set(instance.contracts.map((contract) => contract.contractNumber)))}><ChevronsDownUp size={15} /></button></div>
        <span className="ps1-work-count" role="status">{visibleCount} of {instance.activities.length} activities</span>
        <label className="ps1-work-zoom">Scale <select aria-label="Schedule scale" value={zoom} onChange={(event) => { const nextZoom = event.target.value as Zoom; const nextLeft = (viewport.left / weekWidth) * WEEK_WIDTHS[nextZoom]; setZoom(nextZoom); setViewport((value) => ({ ...value, left: nextLeft })); if (scrollRef.current) requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollLeft = nextLeft; }); }}><option value="compact">Compact</option><option value="standard">Standard</option><option value="detail">Detailed</option></select></label>
      </div>

      <div className="ps1-work-scroll" ref={scrollRef} tabIndex={0} aria-label="Weekly work schedule, horizontally scrollable" aria-describedby="ps1-work-keyboard-help" onScroll={(event) => { const left = event.currentTarget.scrollLeft; setViewport((value) => value.left === left ? value : { ...value, left }); }}>
        <table className="ps1-work-table" aria-label="Contracts and weekly scheduled access" style={{ "--ps1-work-week-width": `${weekWidth}px`, "--ps1-work-timeline-width": `${timelineWidth}px` } as CSSProperties}>
          <thead><tr><th scope="col" ref={labelRef} className="ps1-work-label ps1-work-heading"><span>Contract / activity</span><small>Access yield</small></th>{weeks.map((week) => <th scope="col" key={week} className="ps1-work-week-heading" aria-label={`Week ${week}, ${DATE_FORMAT.format(weekStart(instance.parameters.horizonStart, week))}`}><span>W{String(week).padStart(2, "0")}</span><small>{DATE_FORMAT.format(weekStart(instance.parameters.horizonStart, week))}</small></th>)}</tr></thead>
          {visibleGroups.map(({ contract, rows }) => {
            const isCollapsed = collapsed.has(contract.contractNumber);
            const scheduledRows = rows.filter((row) => row.first > 0);
            const first = scheduledRows.length ? Math.min(...scheduledRows.map((row) => row.first)) : 0;
            const last = scheduledRows.length ? Math.max(...scheduledRows.map((row) => row.last)) : 0;
            const overrun = results.get(contract.contractNumber)?.overrunDays ?? 0;
            const deadline = weekOf(instance.parameters.horizonStart, contract.plannedCompletionDate);
            return <tbody key={contract.contractNumber}>
              <tr className="ps1-work-contract-row"><th scope="row" className="ps1-work-label"><button className="ps1-work-contract-toggle" type="button" aria-expanded={!isCollapsed} aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${contract.contractNumber}: ${contract.contractDescription}`} onClick={() => toggleContract(contract.contractNumber)}>{isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<strong>{contract.contractNumber}</strong><span title={contract.contractDescription}>{contract.contractDescription}</span><small>{rows.length}</small></button></th><td colSpan={horizon}><div className="ps1-work-track"><Deadline contract={contract} week={deadline} horizon={horizon} weekWidth={weekWidth} />{first > 0 && <div className={`ps1-work-summary ${overrun > 0 ? "ps1-work-summary-late" : ""}`} style={{ left: (first - 1) * weekWidth + 5, width: (last - first + 1) * weekWidth - 10 }} title={`${contract.contractNumber} summary, weeks ${first}–${last}; intermittent accesses, not continuous occupation`}><span>Summary · W{first}–{last}{overrun > 0 ? ` · +${overrun}d` : ""}</span></div>}</div></td></tr>
              {!isCollapsed && rows.map(({ activity, accesses, delivered, lateDays }) => {
                const selected = selectedIds.has(activity.activityId);
                const plannedStart = weekOf(instance.parameters.horizonStart, activity.plannedStartDate);
                const changed = changedIds.has(activity.activityId);
                return <tr key={activity.activityId} className={`ps1-work-activity-row ${selected ? "ps1-work-selected" : ""} ${changed ? "ps1-work-changed" : ""}`}>
                  <th scope="row" className="ps1-work-label"><button ref={(element) => { if (element) activityRefs.current.set(activity.activityId, element); else activityRefs.current.delete(activity.activityId); }} type="button" className="ps1-work-activity-select" tabIndex={activity.activityId === focusableActivityId ? 0 : -1} aria-pressed={selected} aria-label={`Inspect ${activity.activityId}: ${activity.activityType}${activity.predecessorActivityId ? `, after ${activity.predecessorActivityId}` : ""}`} onClick={() => onSelect({ kind: "activity", activityId: activity.activityId })} onKeyDown={(event) => navigateActivity(event, activity.activityId)} title={`${activity.activityId} · ${activity.activityType}\n${activity.startLocationId} → ${activity.endLocationId}${activity.predecessorActivityId ? `\nAfter ${activity.predecessorActivityId}` : ""}`}><span className="ps1-work-branch" aria-hidden="true" /><span className="ps1-work-id">{activity.activityId}</span><span className="ps1-work-route">{shortLocation(activity.startLocationId)} → {shortLocation(activity.endLocationId)}</span>{pinnedIds.has(activity.activityId) && <PinIcon size={10} aria-label="Pinned activity" />}<span className={`ps1-work-yield ${delivered < activity.totalAccesses ? "ps1-work-incomplete" : ""}`}>{delivered}/{activity.totalAccesses}</span></button></th>
                  <td colSpan={horizon}><div className="ps1-work-track">
                    {plannedStart > 1 && <span className="ps1-work-before-start" style={{ width: Math.min(horizon, plannedStart - 1) * weekWidth }} title={`Before planned start: ${activity.plannedStartDate}`} />}
                    <Deadline contract={contract} week={deadline} horizon={horizon} weekWidth={weekWidth} />
                    {accesses.map((access, accessIndex) => {
                      const pinned = pinnedWeeks.has(`${activity.activityId}|${access.week}`);
                      const label = `${activity.activityId}, week ${access.week}: ${access.eclo ? "1.5 access-nights of work, ECLO" : "1 access-night of work"}${pinned ? ", pinned" : ""}`;
                      return <button type="button" tabIndex={-1} ref={(element) => { const key = `${activity.activityId}|${access.week}`; if (element) accessRefs.current.set(key, element); else accessRefs.current.delete(key); }} onKeyDown={(event) => navigateAccess(event, activity.activityId, accesses, accessIndex)} key={`${access.week}-${access.accessSeq}`} className={`ps1-work-access ${access.eclo ? "ps1-work-eclo" : ""} ${pinned ? "ps1-work-pinned" : ""} ${lateDays > 0 && weekEnd(instance.parameters.horizonStart, access.week).getTime() > new Date(`${contract.plannedCompletionDate}T00:00:00Z`).getTime() ? "ps1-work-access-late" : ""}`} style={{ left: (access.week - 1) * weekWidth + 4, width: weekWidth - 8 }} aria-label={label} title={`${label}\n${activity.activityType} · ${contract.accessType}\nSelect to inspect schedule and constraints`} aria-pressed={selected} onClick={() => onSelect({ kind: "activity", activityId: activity.activityId })}>{access.eclo ? "1.5" : "1"}{pinned && <PinIcon size={9} aria-hidden="true" />}</button>;
                    })}
                    {!accesses.length && <span className="ps1-work-unscheduled">No scheduled access</span>}
                    {lateDays > 0 && <span className="ps1-work-late-label" style={{ left: Math.min(horizon * weekWidth - 48, (accesses.at(-1)?.week ?? 0) * weekWidth + 3) }}>+{lateDays}d</span>}
                  </div></td>
                </tr>;
              })}
            </tbody>;
          })}
        </table>
        {!visibleGroups.length && <div className="ps1-work-empty"><strong>No matching activities</strong><span>Try another contract, activity or location.</span><button type="button" onClick={clearFilters}>Clear filters</button></div>}
      </div>

      <p id="ps1-work-keyboard-help" className="sr-only">On an activity, use up and down arrows to inspect adjacent activities, and right arrow to reach its scheduled accesses. Use left and right arrows between accesses, and Escape to return to the activity.</p>
      <div className="ps1-work-legend"><span><i className="ps1-work-key-access" />Scheduled access</span><span><i className="ps1-work-key-eclo" />ECLO · 1.5 yield</span><span><i className="ps1-work-key-start" />Before planned start</span><span><i className="ps1-work-key-deadline" />Planned completion</span><span><i className="ps1-work-key-late" />Past planned date</span><span className="ps1-work-week-note">Weekly allocation · not clock time</span></div>

      <div className="ps1-work-overview">
        <div className="ps1-work-overview-title"><strong>Horizon overview</strong><span>W{firstWeek}–W{lastWeek} of {horizon}</span></div>
        <div className="ps1-work-overview-chart" aria-label="Scheduled accesses by week">
          {overview.map((count, index) => <button type="button" key={index} aria-label={`Go to week ${index + 1}, ${count} scheduled accesses`} title={`Week ${index + 1} · ${count} scheduled accesses`} onClick={() => goToWeek(index + 1)}><span style={{ height: `${Math.max(3, count / peak * 100)}%` }} /><small>{index === 0 || (index + 1) % 5 === 0 ? index + 1 : ""}</small></button>)}
          <div className="ps1-work-overview-window" aria-hidden="true" style={{ left: `${Math.min(100, viewport.left / timelineWidth * 100)}%`, width: `${Math.min(100, visibleWeeks / horizon * 100)}%` }} />
        </div>
        <input className="ps1-work-overview-range" type="range" min={1} max={maxFirstWeek} step={1} value={Math.min(maxFirstWeek, firstWeek)} aria-label="First visible schedule week" aria-valuetext={`Weeks ${firstWeek} to ${lastWeek}`} onChange={(event) => goToWeek(Number(event.target.value))} />
      </div>
    </section>
  );
}

function Deadline({ contract, week, horizon, weekWidth }: { contract: Contract; week: number; horizon: number; weekWidth: number }) {
  if (week < 1 || week > horizon) return null;
  return <span className="ps1-work-deadline" role="img" aria-label={`Planned completion ${contract.plannedCompletionDate}`} title={`Planned completion · ${contract.plannedCompletionDate}`} style={{ left: week * weekWidth - 1 }} />;
}

function shortLocation(location: string) {
  const [, line, section, bound] = location.split(":");
  return [line, section?.replaceAll("_", "–"), bound].filter(Boolean).join(" ");
}
