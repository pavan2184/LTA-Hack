import type { Ps1Instance, Submission } from "../types/ps1";
import { buildNetwork, type Network } from "./network";
import { scheduleInstance, type Pin, type RejectedPin } from "./schedule";

/**
 * Urgent maintenance takes a location's nights away mid-horizon.
 *
 * The brief's first bonus direction: impact-assess and re-plan when a
 * disruption cuts access, "with minimal churn on unaffected work". Churn is the
 * whole point. A replan that produces a better schedule by moving everything is
 * useless operationally — contractors have already been told when they are
 * working, and every moved access is a phone call.
 */
export interface Disruption {
  locationId: string;
  /** First affected week, inclusive. */
  fromWeek: number;
  /** Last affected week, inclusive. Open-ended when omitted. */
  toWeek?: number;
  /** The reduced number of possessions the location can hold. */
  capacity: number;
}

export function appliesTo(disruption: Disruption, locationId: string, week: number): boolean {
  if (disruption.locationId !== locationId) return false;
  if (week < disruption.fromWeek) return false;
  return disruption.toWeek === undefined || week <= disruption.toWeek;
}

/** The capacity of a location in a week, after any disruption that covers it. */
export function capacityAt(
  network: Network,
  disruptions: Disruption[],
  locationId: string,
  week: number,
): number {
  const nominal = network.supply.get(locationId)?.supplyCapacity ?? 0;
  // The tightest disruption wins; two overlapping cuts do not add up.
  return disruptions.reduce(
    (capacity, disruption) =>
      appliesTo(disruption, locationId, week) ? Math.min(capacity, disruption.capacity) : capacity,
    nominal,
  );
}

export interface AffectedLocationWeek {
  locationId: string;
  week: number;
  possessions: number;
  nominalCapacity: number;
  reducedCapacity: number;
  /** Possessions that no longer fit and must give up their slot. */
  excess: number;
}

export interface DisruptionImpact {
  disruptions: Disruption[];
  affected: AffectedLocationWeek[];
  /** Accesses that have to move, chosen cheapest-first. */
  displaced: { activityId: string; week: number; contractNumber: string; reason: string }[];
  displacedActivityIds: string[];
}

/**
 * Which accesses a disruption forces out, without yet deciding where they go.
 *
 * When a location-week is over its reduced capacity, something has to give.
 * The choice follows the brief's own cost ordering: give up the possession
 * belonging to the cheapest contract tier first, because a Priority-3
 * overrun-day costs 1x against a Priority-1's 100x. Within a tier, the activity
 * with the least work left to do moves, since it is the easiest to re-place.
 */
export function assessDisruption(
  instance: Ps1Instance,
  submission: Submission,
  disruptions: Disruption[],
  network: Network = buildNetwork(instance),
): DisruptionImpact {
  const activityById = new Map(instance.activities.map((a) => [a.activityId, a]));
  const contractByNumber = new Map(instance.contracts.map((c) => [c.contractNumber, c]));

  const byLocationWeek = new Map<string, Map<string, Set<string>>>();
  for (const row of submission.occupancy) {
    const key = `${row.locationId}|${row.week}`;
    const groups = byLocationWeek.get(key) ?? new Map<string, Set<string>>();
    const members = groups.get(row.coShareGroup) ?? new Set<string>();
    members.add(row.activityId);
    groups.set(row.coShareGroup, members);
    byLocationWeek.set(key, groups);
  }

  const affected: AffectedLocationWeek[] = [];
  const displaced: DisruptionImpact["displaced"] = [];
  const displacedKeys = new Set<string>();

  for (const [key, groups] of byLocationWeek) {
    const [locationId, weekRaw] = key.split("|");
    const week = Number(weekRaw);
    const nominal = network.supply.get(locationId)?.supplyCapacity ?? 0;
    const reduced = capacityAt(network, disruptions, locationId, week);
    if (reduced >= nominal) continue;
    if (groups.size <= reduced) continue;

    const excess = groups.size - reduced;
    affected.push({
      locationId,
      week,
      possessions: groups.size,
      nominalCapacity: nominal,
      reducedCapacity: reduced,
      excess,
    });

    // Rank possessions by what they would cost to move, cheapest first.
    const ranked = [...groups]
      .map(([group, members]) => {
        const ids = [...members];
        const tiers = ids.map(
          (id) => contractByNumber.get(activityById.get(id)!.contractNumber)!.contractPriority,
        );
        const work = ids.reduce((sum, id) => sum + activityById.get(id)!.totalAccesses, 0);
        return { group, ids, worstTier: Math.min(...tiers), work };
      })
      // A higher tier number is a cheaper contract, so it moves first.
      .sort((a, b) => b.worstTier - a.worstTier || a.work - b.work || a.group.localeCompare(b.group));

    for (const entry of ranked.slice(0, excess)) {
      for (const activityId of entry.ids) {
        const dedupe = `${activityId}|${week}`;
        if (displacedKeys.has(dedupe)) continue;
        displacedKeys.add(dedupe);
        displaced.push({
          activityId,
          week,
          contractNumber: activityById.get(activityId)!.contractNumber,
          reason: `${locationId} fell from ${nominal} to ${reduced} possession${reduced === 1 ? "" : "s"} in wk${week}`,
        });
      }
    }
  }

  affected.sort((a, b) => a.week - b.week || a.locationId.localeCompare(b.locationId));
  displaced.sort((a, b) => a.week - b.week || a.activityId.localeCompare(b.activityId));

  return {
    disruptions,
    affected,
    displaced,
    displacedActivityIds: [...new Set(displaced.map((entry) => entry.activityId))].sort(),
  };
}

export interface Churn {
  /** Accesses held exactly where they were. */
  unchangedAccesses: number;
  /** Accesses that ended up in a different week. */
  movedAccesses: number;
  movedActivityIds: string[];
  /** Share of the original schedule left untouched. */
  percentUnchanged: number;
}

export interface ReplanOutcome {
  submission: Submission & { rejectedPins: RejectedPin[] };
  impact: DisruptionImpact;
  churn: Churn;
}

/**
 * Re-plan around a disruption, holding everything it did not touch.
 *
 * The mechanism is the pin: every access that survives the disruption is handed
 * back to the scheduler as a hard constraint, so it cannot drift, and only the
 * displaced accesses are re-placed. That is what keeps churn honest rather than
 * merely low — the untouched work is not "probably" in the same place, it is
 * pinned there.
 */
export function replanForDisruption(
  instance: Ps1Instance,
  submission: Submission,
  disruptions: Disruption[],
  network: Network = buildNetwork(instance),
): ReplanOutcome {
  const impact = assessDisruption(instance, submission, disruptions, network);
  const displacedKeys = new Set(
    impact.displaced.map((entry) => `${entry.activityId}|${entry.week}`),
  );

  const pins: Pin[] = submission.access
    .filter((row) => !displacedKeys.has(`${row.activityId}|${row.week}`))
    .map((row) => ({ activityId: row.activityId, week: row.week, eclo: row.eclo }));

  const replanned = scheduleInstance(
    instance,
    { scenario: submission.scenario, pins, disruptions },
    network,
  );

  const before = new Map<string, Set<number>>();
  for (const row of submission.access) {
    before.set(row.activityId, (before.get(row.activityId) ?? new Set()).add(row.week));
  }
  let unchanged = 0;
  let moved = 0;
  const movedActivityIds = new Set<string>();
  for (const row of replanned.access) {
    if (before.get(row.activityId)?.has(row.week)) unchanged += 1;
    else {
      moved += 1;
      movedActivityIds.add(row.activityId);
    }
  }
  const total = Math.max(1, replanned.access.length);

  return {
    submission: replanned,
    impact,
    churn: {
      unchangedAccesses: unchanged,
      movedAccesses: moved,
      movedActivityIds: [...movedActivityIds].sort(),
      percentUnchanged: Math.round((unchanged / total) * 1000) / 10,
    },
  };
}
