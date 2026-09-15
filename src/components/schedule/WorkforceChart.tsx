"use client";

import { useId, useMemo, useState } from "react";
import { literalWorld } from "@railplan/core/domain/world";
import { assessWorkforce } from "@railplan/core/engine/workforce";
import {
  buildWorkforceSeries,
  type WorkforceSeriesInterval,
} from "@railplan/core/engine/workforce-series";
import { formatClock } from "@railplan/core/engine/intervals";
import type { Plan } from "@railplan/core/types/railplan";
import type { ValidationContext } from "@railplan/core/engine/validate";

export interface WorkforceChartProps {
  /** Dense saved-night panel; all values and accessible detail remain available. */
  compact?: boolean;
  plan: Plan | null;
  context: ValidationContext;
  loading?: boolean;
  stale?: boolean;
  infeasible?: boolean;
  selectedRequestId?: string | null;
  onSelectRequest: (id: string) => void;
  viewState?: WorkforceChartViewState;
  onViewStateChange?: (view: WorkforceChartViewState) => void;
}

export interface WorkforceChartViewState {
  filter: { teamId: string; roleId: string } | null;
  selection: { basis: string; start: number } | null;
}

const emptyViewState = (): WorkforceChartViewState => ({
  filter: null,
  selection: null,
});
const signed = (value: number) =>
  value < 0 ? `−${Math.abs(value)}` : value > 0 ? `+${value}` : "0";
const span = (row: { start: number; end: number }) =>
  `${formatClock(row.start)}–${formatClock(row.end)}`;
const button =
  "rounded border border-rule-strong px-2 py-1 text-xs hover:bg-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function WorkforceChart(props: WorkforceChartProps) {
  return (
    <section
      aria-label="Workforce availability and demand"
      className={
        props.compact
          ? "min-w-0 space-y-2 bg-surface"
          : "min-w-0 space-y-3 rounded border border-rule bg-surface p-4"
      }
    >
      <header className={props.compact ? "sr-only" : undefined}>
        <h2 className="text-base font-semibold">
          Workforce availability and demand
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Anonymous people by team and role. Remaining = available − demanded.
          Crew capacity is a separate constraint.
        </p>
      </header>
      {props.loading && (
        <p role="status" className="text-sm">
          Loading workforce results…
        </p>
      )}
      {!props.loading && !props.plan && (
        <p className="text-sm text-ink-700">
          No plan is available. Load or generate a plan to inspect workforce
          demand.
        </p>
      )}
      {props.plan && (
        <div hidden={props.loading} inert={props.loading} className="space-y-3">
          <WorkforceDetails {...props} plan={props.plan} />
        </div>
      )}
    </section>
  );
}
function WorkforceDetails({
  compact,
  plan,
  context,
  stale,
  infeasible,
  selectedRequestId,
  onSelectRequest,
  viewState: controlledViewState,
  onViewStateChange,
}: WorkforceChartProps & { plan: Plan }) {
  const [expanded, setExpanded] = useState(false);
  const world = context.world ?? literalWorld();
  const assessment = useMemo(
    () => assessWorkforce(plan, context),
    [plan, context],
  );
  const roles = world.instance.workforceRoles;
  const knownPair = (row: { teamId: string; roleId: string }) =>
    world.teams.some((team) => team.id === row.teamId) &&
    roles.some((role) => role.id === row.roleId);
  const unlisted = assessment.intervals.filter((row) => !knownPair(row));
  const initial =
    assessment.shortages.find(knownPair) ??
    assessment.intervals.find(knownPair);
  const [localViewState, setLocalViewState] = useState(emptyViewState);
  const viewState = controlledViewState ?? localViewState;
  const updateViewState = onViewStateChange ?? setLocalViewState;
  const { filter, selection } = viewState;
  const setFilter = (next: { teamId: string; roleId: string }) =>
    updateViewState({ filter: next, selection: null });
  const setSelection = (next: { basis: string; start: number }) =>
    updateViewState({ ...viewState, selection: next });
  const teamId =
    filter && world.teamById[filter.teamId]
      ? filter.teamId
      : (initial?.teamId ?? world.teams[0]?.id ?? "");
  const roleId =
    filter && roles.some((role) => role.id === filter.roleId)
      ? filter.roleId
      : (initial?.roleId ?? roles[0]?.id ?? "");
  // Retain the engineering window but extend it for out-of-window work, so
  // an overrun cannot disappear beyond the plotted handback boundary.
  const start = Math.min(
    world.windowStart,
    ...assessment.intervals.map((row) => row.start),
  );
  const end = Math.max(
    world.windowEnd,
    ...assessment.intervals.map((row) => row.end),
  );
  const rows = useMemo(
    () =>
      teamId && roleId && end > start
        ? buildWorkforceSeries(assessment, {
            teamId,
            roleId,
            start,
            end,
            slotMinutes: world.slotMinutes,
          })
        : [],
    [assessment, teamId, roleId, start, end, world.slotMinutes],
  );
  const basis = JSON.stringify([
    world.instance.planningNight,
    teamId,
    roleId,
    rows,
    assessment.missingRequestIds,
    !!stale,
    !!infeasible,
  ]);
  const selected =
    selection?.basis === basis
      ? rows.find((row) => row.start === selection.start)
      : undefined;
  const unknown = assessment.missingRequestIds.length > 0;
  const hasShortage = rows.some((row) => row.shortfall > 0);
  const pattern = useId();
  const teamName = world.teamById[teamId]?.name ?? teamId;
  const roleName = roles.find((role) => role.id === roleId)?.name ?? roleId;
  const requestButton = (id: string) => (
    <button
      key={id}
      className={button}
      aria-pressed={selectedRequestId === id}
      onClick={() => onSelectRequest(id)}
    >
      {id}
      {world.requestById[id] ? ` · ${world.requestById[id].shortTitle}` : ""}
    </button>
  );
  const shortageLabel = (row: WorkforceSeriesInterval) =>
    unknown
      ? row.shortfall
        ? `At least ${row.shortfall}`
        : "Unknown total"
      : row.shortfall
        ? `Shortage: ${row.shortfall}`
        : "No shortage";
  const plotLeft = 42,
    plotRight = 730,
    plotTop = 12,
    plotBottom = 142;
  const maximum = Math.max(
    1,
    ...rows.flatMap((row) => [row.available, row.demand, row.remaining]),
  );
  const minimum = Math.min(0, ...rows.map((row) => row.remaining));
  const x = (minute: number) =>
    plotLeft + ((minute - start) / (end - start)) * (plotRight - plotLeft);
  const y = (count: number) =>
    plotBottom -
    ((count - minimum) / (maximum - minimum)) * (plotBottom - plotTop);
  const path = (key: "available" | "demand" | "remaining") =>
    rows
      .map(
        (row, index) =>
          `${index ? "L" : "M"}${x(row.start)},${y(row[key])} L${x(row.end)},${y(row[key])}`,
      )
      .join(" ");
  const tickStep = Math.max(
    world.slotMinutes,
    Math.ceil((end - start) / (8 * world.slotMinutes)) * world.slotMinutes,
  );
  const ticks = Array.from(
    { length: Math.ceil((end - start) / tickStep) },
    (_, index) => start + index * tickStep,
  ).concat(end);
  if (compact) return (
    <div className="workforce-overview">
      <button className="workforce-disclosure" type="button" aria-label="Workforce availability" aria-describedby={`${pattern}-status`} aria-controls={`${pattern}-content`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className="font-semibold">Workforce availability</span>
        <span id={`${pattern}-status`} className="text-xs">{unknown ? "Demand incomplete" : assessment.shortages.length ? `${assessment.shortages.length} shortage intervals` : "No shortages in this draft"}{stale ? " · Preview changed" : ""}</span>
        <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
      </button>
      <div id={`${pattern}-content`} className="workforce-expanded-content" hidden={!expanded} inert={!expanded}>
      <div className="workforce-overview-key">{teamName} · {roleName} · People <span>━ Demand　┄ Available</span></div>
      <svg viewBox="0 0 750 174" preserveAspectRatio="none" role="img" aria-label={`Workforce overview: ${teamName}, ${roleName}, available and ${unknown ? "known " : ""}demanded people. ${assessment.shortages.length} shortage intervals across the plan.`}>
        {[minimum, maximum].map(value => <g key={value}><line x1={plotLeft} x2={plotRight} y1={y(value)} y2={y(value)} stroke="#e0e5ec" /><text x="28" y={y(value) + 4} fontSize="14" fill="#566171">{value}</text></g>)}
        {ticks.filter((_, i) => i % 2 === 0 || i === ticks.length - 1).map(minute => <text key={minute} x={x(minute)} y="167" textAnchor="middle" fontSize="14" fill="#566171">{formatClock(minute)}</text>)}
        {rows.length > 0 && <path d={`${path("demand")} L${x(end)},${y(0)} L${x(start)},${y(0)} Z`} fill="#e9f2ff" />}
        <path d={path("available")} fill="none" stroke="#8999ad" strokeWidth="2" strokeDasharray="7 4" />
        <path d={path("demand")} fill="none" stroke="#0877ff" strokeWidth="2" />
      </svg>
      <WorkforceDetails plan={plan} context={context} stale={stale} infeasible={infeasible} selectedRequestId={selectedRequestId} onSelectRequest={onSelectRequest} />
      </div>
    </div>
  );
  return (
    <>
      {stale && (
        <p
          role="status"
          className="border-l-4 border-signal-amber pl-3 text-sm"
        >
          Impact preview: the active scenario has been applied to the current
          placements. Replan to produce a schedule for these changed conditions.
        </p>
      )}
      {infeasible && (
        <p className="text-sm font-medium">
          Plan is infeasible. These staffing values describe its current
          placements, not an approved schedule.
        </p>
      )}
      {!plan.placements.length && (
        <p className="text-sm">
          No requests are scheduled. Declared availability is shown without
          scheduled demand.
        </p>
      )}
      {unknown && (
        <div className="space-y-2 border-l-4 border-signal-amber pl-3 text-sm">
          <p>
            Demand is unknown for {assessment.missingRequestIds.join(", ")}.
            Known demand is a lower bound; remaining may be overstated and total
            shortage is unknown.
          </p>
          <div className="flex flex-wrap gap-2">
            {assessment.missingRequestIds.map(requestButton)}
          </div>
        </div>
      )}
      {unlisted.length > 0 && (
        <section
          aria-label="Unlisted workforce intervals"
          className="space-y-2 border-l-4 border-signal-amber pl-3 text-sm"
        >
          <p>
            Some workforce intervals use unknown teams or roles. Their data
            remains visible here because the filters contain only known
            references.
          </p>
          <details>
            <summary className="cursor-pointer">
              Unlisted team/role intervals ({unlisted.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {unlisted.map((row) => (
                <li
                  key={`${row.teamId}-${row.roleId}-${row.start}`}
                  className="space-y-1"
                >
                  <p>
                    {row.teamId} · {row.roleId} · {span(row)}: available{" "}
                    {row.available}, demand {row.demand}, remaining{" "}
                    {signed(row.available - row.demand)},{" "}
                    {unknown ? "known " : ""}shortage {row.shortfall}.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {row.requestIds.map(requestButton)}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
      {!world.teams.length || !roles.length || !rows.length ? (
        <p className="text-sm">
          No team, role or valid planning window is available for this chart.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="min-w-0">
              Team
              <select
                aria-label="Workforce team"
                className="ml-2 max-w-full rounded border border-rule-strong bg-surface p-1"
                value={teamId}
                onChange={(e) => setFilter({ teamId: e.target.value, roleId })}
              >
                {world.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0">
              Role
              <select
                aria-label="Workforce role"
                className="ml-2 max-w-full rounded border border-rule-strong bg-surface p-1"
                value={roleId}
                onChange={(e) => setFilter({ teamId, roleId: e.target.value })}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!unknown && !hasShortage && (
            <p className="text-xs text-ink-700">
              No shortages for {teamName} · {roleName} in these placements.
              {assessment.shortages.length > 0
                ? " Other team/role pairs have shortages; change the filters to inspect them."
                : " This does not establish overall plan feasibility."}
            </p>
          )}
          <figure className="space-y-2">
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(520, rows.length * 10) }}>
                <svg
                  viewBox="0 0 750 174"
                  className="block w-full"
                  role="img"
                  aria-label={`${teamName}, ${roleName}: available, ${unknown ? "known " : ""}demanded and remaining people over time. Exact values follow in the interval table.`}
                >
                  <defs>
                    <pattern
                      id={pattern}
                      width="6"
                      height="6"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(45)"
                    >
                      <line
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="6"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </pattern>
                  </defs>
                  {rows
                    .filter((row) => row.shortfall > 0)
                    .map((row) => (
                      <rect
                        key={row.start}
                        x={x(row.start)}
                        y={plotTop}
                        width={x(row.end) - x(row.start)}
                        height={plotBottom - plotTop}
                        fill={`url(#${pattern})`}
                        className="text-signal-red"
                        opacity={0.16}
                      />
                    ))}
                  {[minimum, maximum, ...(minimum < 0 ? [0] : [])].map(
                    (value) => (
                      <g key={value}>
                        <line
                          x1={plotLeft}
                          x2={plotRight}
                          y1={y(value)}
                          y2={y(value)}
                          stroke="currentColor"
                          className="text-rule-strong"
                          strokeDasharray="2 3"
                        />
                        <text
                          x={plotLeft - 6}
                          y={y(value) + 4}
                          textAnchor="end"
                          fontSize="11"
                          fill="currentColor"
                        >
                          {signed(value)}
                        </text>
                      </g>
                    ),
                  )}
                  {ticks.map((minute) => (
                    <text
                      key={minute}
                      x={x(minute)}
                      y="164"
                      textAnchor="middle"
                      fontSize="11"
                      fill="currentColor"
                    >
                      {formatClock(minute)}
                    </text>
                  ))}
                  <path
                    d={path("available")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-signal-green"
                  />
                  <path
                    d={path("demand")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="7 3"
                    className="text-ink-950"
                  />
                  <path
                    d={path("remaining")}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="2 3"
                    className="text-accent"
                  />
                </svg>
                <div
                  className="flex"
                  style={{
                    marginLeft: `${(plotLeft / 750) * 100}%`,
                    marginRight: `${((750 - plotRight) / 750) * 100}%`,
                  }}
                  aria-label="Inspect workforce intervals"
                >
                  {rows.map((row) => (
                    <button
                      key={row.start}
                      className={`h-7 min-w-0 border border-rule text-xs focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-accent ${row.shortfall > 0 ? "font-bold text-signal-red" : "text-ink-500"}`}
                      style={{
                        width: `${((row.end - row.start) / (end - start)) * 100}%`,
                      }}
                      aria-label={`Inspect ${span(row)}: available ${row.available}, ${unknown ? "known " : ""}demand ${row.demand}, remaining ${signed(row.remaining)}, ${unknown ? "known " : ""}shortage ${row.shortfall}`}
                      aria-pressed={selected?.start === row.start}
                      onClick={() => setSelection({ basis, start: row.start })}
                    >
                      {row.shortfall > 0 ? "!" : "·"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <figcaption className="text-xs text-ink-700">
              Solid: available · Dashed: {unknown ? "known " : ""}demand ·
              Dotted: remaining{unknown ? " before unknown demand" : ""}.
              Hatched intervals and ! mark shortages. Select an interval for
              details. Values apply from each start up to, but excluding, its
              end.
            </figcaption>
          </figure>
          {selected && (
            <section
              aria-label="Selected workforce interval"
              className="space-y-2 border border-rule bg-sunk p-3 text-sm"
            >
              <h3 className="font-semibold">
                {span(selected)} · {teamName} · {roleName}
              </h3>
              <p>
                Available {selected.available}; {unknown ? "known " : ""}demand{" "}
                {selected.demand}; remaining {signed(selected.remaining)};{" "}
                {shortageLabel(selected).toLowerCase()}.
              </p>
              <div className="flex flex-wrap gap-2">
                {selected.requestIds.length ? (
                  selected.requestIds.map(requestButton)
                ) : (
                  <span>No contributing requests with known demand.</span>
                )}
              </div>
            </section>
          )}
          <details className="min-w-0">
            <summary className="cursor-pointer text-sm font-medium">
              Interval values and contributing requests
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table
                aria-label="Workforce interval values"
                className="w-full text-left text-xs"
              >
                <thead>
                  <tr>
                    {[
                      "Interval",
                      "Available",
                      unknown ? "Known demand" : "Demanded",
                      unknown ? "Remaining before unknown demand" : "Remaining",
                      "Shortfall",
                      "Contributing requests",
                    ].map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className="whitespace-nowrap border-b border-rule p-2"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.start}>
                      <th
                        scope="row"
                        className="whitespace-nowrap border-b border-rule p-2"
                      >
                        <button
                          className="underline"
                          onClick={() =>
                            setSelection({ basis, start: row.start })
                          }
                        >
                          {span(row)}
                        </button>
                      </th>
                      <td className="border-b border-rule p-2">
                        {row.available}
                      </td>
                      <td className="border-b border-rule p-2">{row.demand}</td>
                      <td className="border-b border-rule p-2">
                        {signed(row.remaining)}
                      </td>
                      <td className="whitespace-nowrap border-b border-rule p-2">
                        {shortageLabel(row)}
                      </td>
                      <td className="border-b border-rule p-2">
                        <div className="flex flex-wrap gap-1">
                          {row.requestIds.length
                            ? row.requestIds.map(requestButton)
                            : "None with known demand"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </>
  );
}
