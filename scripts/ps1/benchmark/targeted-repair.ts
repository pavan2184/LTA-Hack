import { capacityAt, type Disruption } from "@railplan/ps1/engine/disruption";
import { buildNetwork, closureFor, expandSpan } from "@railplan/ps1/engine/network";
import { validate, weekEnd, weekOf } from "@railplan/ps1/engine/validate";
import { ACTIVITY_NUDGE, CONTRACT_WEIGHT, ECLO_PENALTY, EXCESS_NIGHT_PENALTY,
  type Ps1Instance, type Submission } from "@railplan/ps1/types/ps1";

export type RepairKind = "late-chain" | "spatial-blockers" | "contract" | "location" | "random";
export interface RepairNeighborhood {
  id: string;
  kind: RepairKind;
  targetActivityId?: string;
  movableActivityIds: string[];
  /** The requested seeds/dependency component exceeded maxActivities. */
  truncated: boolean;
}
export interface RepairNeighborhoodOptions {
  seed?: number;
  maxActivities?: number;
  maxNeighborhoods?: number;
  disruptions?: Disruption[];
}

const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const intersects = (a: Set<string>, b: Set<string>) => [...a].some((id) => b.has(id));

/**
 * Select small, overlapping native repair models; this never changes a schedule.
 * Supply each set to runNativeSolver with the same incumbent and original pins.
 * Activities outside it are frozen by the bridge, while explicit pins remain
 * constraints even inside it. A capped chain need not be transitively closed:
 * native precedence constraints still apply across its frozen boundary.
 *
 * Ranking is a heuristic, not an objective bound. Lateness uses the exact v2
 * per-activity penalty; excess-possession cost is shared among the participants
 * only to identify promising targets. Every incumbent is checked under the
 * current disruptions before it can guide selection.
 */
export function selectRepairNeighborhoods(instance: Ps1Instance, incumbent: Submission,
  options: RepairNeighborhoodOptions = {}): RepairNeighborhood[] {
  const { seed = 1, maxNeighborhoods = 8, disruptions = [] } = options;
  const requestedSize = options.maxActivities ?? Math.max(8, Math.ceil(instance.activities.length * 0.25));
  if (!Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647 ||
    !Number.isInteger(requestedSize) || requestedSize < 1 ||
    !Number.isInteger(maxNeighborhoods) || maxNeighborhoods < 1 || maxNeighborhoods > 64) {
    throw new Error("Invalid repair seed/maxActivities/maxNeighborhoods");
  }
  const network = buildNetwork(instance);
  if (!validate(instance, incumbent, network, disruptions).feasible) {
    throw new Error("Repair neighborhood selection requires a feasible incumbent");
  }
  if (instance.activities.length === 0) return [];
  const limit = Math.min(instance.activities.length, requestedSize);
  const contracts = new Map(instance.contracts.map((contract) => [contract.contractNumber, contract]));
  const accessById = new Map<string, Submission["access"]>();
  for (const row of incumbent.access) {
    const rows = accessById.get(row.activityId) ?? [];
    rows.push(row);
    accessById.set(row.activityId, rows);
  }
  const stats = new Map([...instance.activities].sort((a, b) => compareId(a.activityId, b.activityId)).map((activity) => {
    const contract = contracts.get(activity.contractNumber)!;
    const rows = accessById.get(activity.activityId)!;
    const last = Math.max(...rows.map((row) => row.week));
    const weight = CONTRACT_WEIGHT[contract.contractPriority] * (1 + ACTIVITY_NUDGE[activity.activityPriority]);
    const lateDays = Math.max(0, Math.round((weekEnd(instance.parameters.horizonStart, last).getTime() -
      Date.parse(`${contract.plannedCompletionDate}T00:00:00Z`)) / 86_400_000));
    const span = new Set(expandSpan(network, activity.startLocationId, activity.endLocationId));
    const closure = new Set(closureFor(network, [...span], contract.natureOfActivity));
    const eclo = rows.filter((row) => row.eclo === 1).length;
    return [activity.activityId, { activity, contract, rows, last, weight, span, closure, eclo,
      release: Math.max(1, weekOf(instance.parameters.horizonStart, activity.plannedStartDate)),
      penalty: (incumbent.scenario === "B" ? 0 : weight * lateDays) + ECLO_PENALTY * eclo,
      pressure: 0 }];
  }));
  const cells = new Map<string, { locationId: string; week: number; ids: Set<string>; groups: Set<string> }>();
  for (const row of incumbent.occupancy) {
    const key = `${row.locationId}|${row.week}`;
    const cell = cells.get(key) ?? { locationId: row.locationId, week: row.week,
      ids: new Set<string>(), groups: new Set<string>() };
    cell.ids.add(row.activityId);
    cell.groups.add(row.coShareGroup);
    cells.set(key, cell);
  }
  // Sort before accumulation, so CSV row order cannot change floating-point ties.
  for (const [, cell] of [...cells].sort(([a], [b]) => compareId(a, b))) {
    const capacity = capacityAt(network, disruptions, cell.locationId, cell.week);
    const excess = Math.max(0, cell.groups.size - capacity);
    for (const id of cell.ids) {
      const stat = stats.get(id)!;
      stat.pressure += cell.groups.size / Math.max(1, capacity);
      stat.penalty += EXCESS_NIGHT_PENALTY * excess / cell.ids.size;
    }
  }
  const rank = (a: string, b: string) => {
    const first = stats.get(a)!, second = stats.get(b)!;
    return second.penalty - first.penalty || second.pressure - first.pressure ||
      second.weight - first.weight || second.last - first.last || compareId(a, b);
  };
  const ranked = [...stats.keys()].sort(rank);
  const children = new Map<string, string[]>();
  for (const [id, stat] of stats) {
    if (!stat.activity.predecessorActivityId) continue;
    const list = children.get(stat.activity.predecessorActivityId) ?? [];
    list.push(id);
    children.set(stat.activity.predecessorActivityId, list);
  }
  for (const list of children.values()) list.sort(rank);

  const blockerCache = new Map<string, string[]>();
  const blockersFor = (targetId: string): string[] => {
    const cached = blockerCache.get(targetId);
    if (cached) return cached;
    const target = stats.get(targetId)!;
    const scores = new Map<string, number>();
    const add = (id: string, amount: number) => {
      if (id !== targetId) scores.set(id, (scores.get(id) ?? 0) + amount);
    };
    // Look back to release, not just the incumbent's occupied weeks: an earlier
    // possession can block the move that would actually remove lateness.
    for (const cell of cells.values()) {
      if (!target.span.has(cell.locationId) || cell.week < target.release || cell.week > target.last) continue;
      const ids = [...cell.ids].filter((id) => id !== targetId);
      const counts = { PM: 0, PC: 0, C: 0 };
      for (const id of ids) counts[stats.get(id)!.contract.accessType] += 1;
      counts[target.contract.accessType] += 1;
      const needed = counts.PM + Math.max(counts.PC, Math.ceil((counts.PC + counts.C) / 4));
      const capacity = capacityAt(network, disruptions, cell.locationId, cell.week);
      if (needed > capacity) for (const id of ids) add(id, 1 + needed - capacity);
    }
    // Closure overlap is only a weaker proximity signal. The official CSVs do
    // not establish physical-night alignment across distinct possessions, so
    // this must not create a new hard conflict or consume a capacity slot.
    for (const [id, other] of stats) {
      if (id === targetId || !other.rows.some((row) => row.week >= target.release && row.week <= target.last)) continue;
      if (intersects(target.closure, other.span) || intersects(target.span, other.closure)) add(id, 0.05);
    }
    const ordered = [...scores.keys()].sort((a, b) => scores.get(b)! - scores.get(a)! || rank(a, b));
    blockerCache.set(targetId, ordered);
    return ordered;
  };

  const neighborhoods: RepairNeighborhood[] = [];
  const seen = new Set<string>();
  const add = (kind: RepairKind, primary: string[], extras: string[] = [], targetActivityId?: string) => {
    if (neighborhoods.length >= maxNeighborhoods || primary.length === 0) return;
    const ordered: string[] = [], included = new Set<string>();
    const append = (id: string) => { if (!included.has(id)) { included.add(id); ordered.push(id); } };
    primary.forEach(append);
    // Breadth-first traversal keeps the closest predecessors and descendants
    // before distant branches. Both directions include cross-contract links.
    for (let index = 0; index < ordered.length; index += 1) {
      const id = ordered[index], predecessor = stats.get(id)!.activity.predecessorActivityId;
      if (predecessor) append(predecessor);
      for (const child of children.get(id) ?? []) append(child);
    }
    extras.forEach(append);
    const movableActivityIds = ordered.slice(0, limit).sort(compareId);
    const key = JSON.stringify(movableActivityIds);
    if (seen.has(key)) return;
    seen.add(key);
    neighborhoods.push({ id: `${kind}:${targetActivityId ?? primary[0]}`, kind, targetActivityId,
      movableActivityIds, truncated: ordered.length > limit });
  };

  const targetId = ranked[0];
  const blockers = blockersFor(targetId);
  add("late-chain", [targetId], [], targetId);
  add("spatial-blockers", [targetId, ...blockers.slice(0, Math.max(1, Math.floor(limit / 2)))],
    blockers, targetId);

  const byContract = new Map<string, string[]>();
  const byLocation = new Map<string, string[]>();
  for (const id of ranked) {
    const stat = stats.get(id)!;
    const group = byContract.get(stat.contract.contractNumber) ?? [];
    group.push(id);
    byContract.set(stat.contract.contractNumber, group);
    for (const location of stat.span) {
      const members = byLocation.get(location) ?? [];
      members.push(id);
      byLocation.set(location, members);
    }
  }
  const groupRank = (a: [string, string[]], b: [string, string[]]) => {
    const cost = (ids: string[]) => ids.reduce((sum, id) => sum + stats.get(id)!.penalty, 0);
    return cost(b[1]) - cost(a[1]) || b[1].length - a[1].length || compareId(a[0], b[0]);
  };
  const contractGroups = [...byContract].sort(groupRank);
  const locationGroups = [...byLocation].sort(groupRank);
  const groupSeeds = (ids: string[]) => ids.slice(0, Math.max(1, Math.floor(limit * 0.7)));
  const addGroup = (kind: "contract" | "location", group: [string, string[]]) =>
    add(kind, groupSeeds(group[1]), group[1], group[1][0]);
  addGroup("contract", contractGroups[0]);
  addGroup("location", locationGroups[0]);

  let randomState = seed >>> 0;
  const shuffled = [...stats.keys()];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
    const swap = Math.floor((randomState / 4_294_967_296) * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  add("random", shuffled.slice(0, Math.max(1, Math.ceil(limit * 0.65))), shuffled);
  for (const id of ranked.slice(1)) {
    if (neighborhoods.length >= maxNeighborhoods) break;
    add("late-chain", [id], [], id);
    const blockers = blockersFor(id);
    add("spatial-blockers", [id, ...blockers.slice(0, Math.max(1, Math.floor(limit / 2)))], blockers, id);
  }
  for (const group of contractGroups.slice(1)) addGroup("contract", group);
  for (const group of locationGroups.slice(1)) addGroup("location", group);
  return neighborhoods;
}
