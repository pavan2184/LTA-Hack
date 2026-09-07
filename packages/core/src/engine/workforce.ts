import { literalWorld } from "../domain/world";
import type { Plan, Violation } from "../types/railplan";
import { MAX_WORKFORCE_COUNT } from "../types/workforce";
import type { ValidationContext } from "./validate";
import { formatSpan } from "./intervals";

export interface WorkforceInterval {
  teamId: string;
  roleId: string;
  start: number;
  end: number;
  requestIds: string[];
  demand: number;
  available: number;
  shortfall: number;
}
export interface WorkforceAssessment {
  /** Maximal intervals with identical team, role, contributors, demand and supply. */
  intervals: WorkforceInterval[];
  shortages: WorkforceInterval[];
  missingRequestIds: string[];
  personMinutesUsed: number;
  personMinutesAvailable: number;
}

/** Anonymous people assigned for work only, excluding block-clearance time.
 * Supply is absolute, never additive. Missing supply is zero. Demand definitions
 * are required even for emergency/what-if requests; missing is unknown, not zero.
 * Uses the same segmentation for validation and metric provenance. */
export function assessWorkforce(
  plan: Plan,
  context: ValidationContext = {},
): WorkforceAssessment {
  const world = context.world ?? literalWorld();
  const roles = new Set(world.instance.workforceRoles.map((role) => role.id));
  const demandByRequest = new Map<
    string,
    { roleId: string; count: number }[]
  >();
  for (const row of world.instance.workforceDemand) {
    const rows = demandByRequest.get(row.requestId) ?? [];
    rows.push(row);
    demandByRequest.set(row.requestId, rows);
  }
  // Overrides are complete per-request definitions, rather than additive rows.
  const extras = new Map<string, { roleId: string; count: number }[]>();
  for (const row of context.extraWorkforceDemand ?? []) {
    const rows = extras.get(row.requestId) ?? [];
    rows.push(row);
    extras.set(row.requestId, rows);
  }
  extras.forEach((rows, id) => demandByRequest.set(id, rows));

  type Demand = {
    start: number;
    end: number;
    requestId: string;
    count: number;
  };
  type Supply = { start: number; end: number; count: number };
  const groups = new Map<
    string,
    { teamId: string; roleId: string; demand: Demand[]; supply: Supply[] }
  >();
  const group = (teamId: string, roleId: string) => {
    const key = JSON.stringify([teamId, roleId]);
    if (!groups.has(key))
      groups.set(key, { teamId, roleId, demand: [], supply: [] });
    return groups.get(key)!;
  };
  const missing = new Set<string>();
  for (const p of plan.placements) {
    const rows = demandByRequest.get(p.requestId);
    const seen = new Set<string>();
    if (
      !rows?.length ||
      rows.some((row) => {
        const invalid =
          !roles.has(row.roleId) ||
          !Number.isInteger(row.count) ||
          row.count < 1 ||
          row.count > MAX_WORKFORCE_COUNT ||
          seen.has(row.roleId);
        seen.add(row.roleId);
        return invalid;
      })
    ) {
      missing.add(p.requestId);
      continue;
    }
    const end =
      p.endMinute +
      (context.overrun?.requestId === p.requestId
        ? context.overrun.minutes
        : 0);
    for (const row of rows)
      group(p.teamId, row.roleId).demand.push({
        start: p.startMinute,
        end,
        requestId: p.requestId,
        count: row.count,
      });
  }
  for (const row of world.instance.workforceAvailability) {
    if (row.planningNight !== world.instance.planningNight) continue;
    const team = world.teamById[row.teamId];
    const unavailableFrom = Math.min(
      ...(context.unavailableTeams ?? [])
        .filter((item) => item.teamId === row.teamId)
        .map((item) => item.fromMinute),
    );
    const start = Math.max(
      row.startMinute,
      world.windowStart,
      team?.shiftStart ?? world.windowStart,
    );
    const end = Math.min(
      row.endMinute,
      context.windowEnd ?? world.windowEnd,
      world.windowEnd,
      team?.shiftEnd ?? world.windowEnd,
      unavailableFrom,
    );
    if (start < end)
      group(row.teamId, row.roleId).supply.push({
        start,
        end,
        count: row.count,
      });
  }

  const intervals: WorkforceInterval[] = [];
  let personMinutesAvailable = 0;
  let personMinutesUsed = 0;
  for (const entry of [...groups.values()].sort(
    (a, b) =>
      a.teamId.localeCompare(b.teamId) || a.roleId.localeCompare(b.roleId),
  )) {
    const supply = [...entry.supply].sort((a, b) => a.start - b.start);
    if (supply.some((row, i) => i > 0 && row.start < supply[i - 1].end))
      throw new Error("Overlapping workforce availability is ambiguous.");
    personMinutesAvailable += supply.reduce(
      (sum, row) => sum + (row.end - row.start) * row.count,
      0,
    );
    personMinutesUsed += entry.demand.reduce(
      (sum, row) => sum + (row.end - row.start) * row.count,
      0,
    );
    const points = [
      ...new Set(
        [...entry.demand, ...supply].flatMap((row) => [row.start, row.end]),
      ),
    ].sort((a, b) => a - b);
    let previous: WorkforceInterval | undefined;
    for (let i = 0; i < points.length - 1; i += 1) {
      const start = points[i],
        end = points[i + 1];
      const active = entry.demand.filter(
        (row) => row.start <= start && row.end > start,
      );
      const demand = active.reduce((sum, row) => sum + row.count, 0);
      const available =
        supply.find((row) => row.start <= start && row.end > start)?.count ?? 0;
      const requestIds = [
        ...new Set(active.map((row) => row.requestId)),
      ].sort();
      if (
        previous &&
        previous.end === start &&
        previous.demand === demand &&
        previous.available === available &&
        previous.requestIds.join("\0") === requestIds.join("\0")
      ) {
        previous.end = end;
      } else {
        previous = {
          teamId: entry.teamId,
          roleId: entry.roleId,
          start,
          end,
          requestIds,
          demand,
          available,
          shortfall: Math.max(0, demand - available),
        };
        intervals.push(previous);
      }
    }
  }
  return {
    intervals,
    shortages: intervals.filter((row) => row.shortfall > 0),
    missingRequestIds: [...missing].sort(),
    personMinutesUsed,
    personMinutesAvailable,
  };
}

export function workforceViolations(
  plan: Plan,
  context: ValidationContext,
): Omit<Violation, "id">[] {
  const world = context.world ?? literalWorld();
  const assessment = assessWorkforce(plan, context);
  const found: Omit<Violation, "id">[] = assessment.shortages.map((row) => {
    const team = world.teamById[row.teamId]?.name ?? row.teamId;
    const role =
      world.instance.workforceRoles.find((item) => item.id === row.roleId)
        ?.name ?? row.roleId;
    const span = formatSpan(row.start, row.end);
    return {
      ruleId: "WORKFORCE_CAPACITY",
      severity: "critical",
      requestIds: row.requestIds,
      title: `${team} is short of ${row.shortfall} ${role} people`,
      detail: `${row.requestIds.join(", ")} require ${row.demand} ${role} people from ${team} during ${span}; ${row.available} are available, a shortfall of ${row.shortfall}.`,
      subjects: [team, role],
      observed: `${row.demand} people demanded`,
      required: `at most ${row.available} people available`,
      shortfallMinutes: row.end - row.start,
      window: { start: row.start, end: row.end },
      workforce: {
        teamId: row.teamId,
        roleId: row.roleId,
        demand: row.demand,
        available: row.available,
        shortfall: row.shortfall,
      },
      remedy: `Move or stagger ${row.requestIds.join(" and ")} into declared availability, or provide ${row.shortfall} additional ${role} people for ${team} during ${span}.`,
    };
  });
  for (const requestId of assessment.missingRequestIds) {
    const p = plan.placements.find((item) => item.requestId === requestId)!;
    found.push({
      ruleId: "WORKFORCE_CAPACITY",
      severity: "critical",
      requestIds: [requestId],
      title: `${requestId} has no valid workforce demand definition`,
      detail: `Staffing for ${requestId} is unknown. Feasibility cannot be established without explicit role headcounts.`,
      subjects: [world.teamById[p.teamId]?.name ?? p.teamId],
      observed: "unknown workforce demand",
      required: "explicit valid role headcounts",
      shortfallMinutes: 0,
      window: null,
      workforce: {
        teamId: p.teamId,
        roleId: null,
        demand: null,
        available: null,
        shortfall: null,
      },
      remedy: `Define the workforce demand for ${requestId} before scheduling it.`,
    });
  }
  return found;
}
