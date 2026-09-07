import type { PlanningInstance } from "./instance";
import { MAX_WORKFORCE_COUNT } from "../types/workforce";
/** Shared structural/reference validation, separate from #8 staffing feasibility.
 * Reject ambiguous supply instead of summing overlapping absolute headcounts. */
export function assertWorkforceInstance(instance: PlanningInstance): void {
  const roles = new Set<string>(),
    teams = new Set(instance.teams.map((t) => t.id)),
    requests = new Set(instance.requests.map((r) => r.id));
  const fail = () => {
    throw new Error(
      "Invalid workforce facts: check role/team/request references, counts, night bounds and duplicate or overlapping windows.",
    );
  };
  const id = (value: string) =>
    typeof value === "string" &&
    value.trim() === value &&
    value.length >= 1 &&
    value.length <= 64;
  const count = (value: number, min: number) =>
    Number.isInteger(value) && value >= min && value <= MAX_WORKFORCE_COUNT;
  for (const role of instance.workforceRoles) {
    if (
      !id(role.id) ||
      typeof role.name !== "string" ||
      role.name.trim().length < 1 ||
      role.name.length > 120 ||
      roles.has(role.id)
    )
      fail();
    roles.add(role.id);
  }
  const seenDemand = new Set<string>();
  for (const row of instance.workforceDemand) {
    const key = JSON.stringify([row.requestId, row.roleId]);
    if (
      !id(row.requestId) ||
      !roles.has(row.roleId) ||
      !requests.has(row.requestId) ||
      !count(row.count, 1) ||
      seenDemand.has(key)
    )
      fail();
    seenDemand.add(key);
  }
  const windows = new Map<string, { start: number; end: number }[]>();
  for (const row of instance.workforceAvailability) {
    if (
      row.planningNight !== instance.planningNight ||
      !id(row.teamId) ||
      !teams.has(row.teamId) ||
      !roles.has(row.roleId) ||
      !count(row.count, 0) ||
      !Number.isInteger(row.startMinute) ||
      !Number.isInteger(row.endMinute) ||
      row.startMinute < 0 ||
      row.startMinute > 1440 ||
      row.endMinute > 2880 ||
      row.startMinute < instance.window.startMinute ||
      row.endMinute > instance.window.endMinute ||
      row.startMinute >= row.endMinute
    )
      fail();
    const key = JSON.stringify([row.teamId, row.roleId]),
      prior = windows.get(key) ?? [];
    if (prior.some((w) => w.start < row.endMinute && row.startMinute < w.end))
      fail();
    prior.push({ start: row.startMinute, end: row.endMinute });
    windows.set(key, prior);
  }
}
