import {
  ECLO_YIELD,
  STANDARD_YIELD,
  type AccessRow,
  type Activity,
  type Contract,
  type OccupancyRow,
  type Ps1Instance,
  type ResultRow,
  type Scenario,
  type Submission,
} from "../types/ps1";
import { buildNetwork, expandSpan, type Network } from "./network";
import { isoDate, weekEnd, weekOf, MAX_ACTIVITIES_PER_POSSESSION } from "./validate";
import { capacityAt, type Disruption } from "./disruption";

/**
 * A greedy, priority-ordered scheduler for PS1.
 *
 * The brief's own cost ordering drives the design. Cheapest to costliest per
 * unit: a Priority-3 overrun-day (1x), an excess access-night (3x), an ECLO
 * night (4.3x), a Priority-2 overrun-day (10x), a Priority-1 overrun-day
 * (100x). So the scheduler places the most expensive work first, while the
 * network is empty and early weeks are still free, and lets cheap work absorb
 * whatever congestion is left. Every lever it reaches for is the cheapest one
 * still available in the scenario it is solving.
 *
 * It is greedy rather than exact on purpose. The mandatory gate is that all
 * 100% of activities are scheduled; an exact method that times out and returns
 * nothing scores zero, while a greedy pass that always returns a complete
 * schedule scores whatever its quality earns.
 */

/**
 * A week a works controller has fixed by hand.
 *
 * Pins are entered as hard constraints *before* the solve, not laid over the
 * result afterwards, so a controller's decision moves the rest of the schedule
 * and the numbers with it. RailPlan settled this the same way, for the same
 * reason: an overlay lets the tool report a plan nobody could actually run.
 */
export interface Pin {
  activityId: string;
  week: number;
  /** Preserved when re-pinning an existing schedule, so yields do not change. */
  eclo?: 0 | 1;
}

export interface ScheduleOptions {
  scenario: Scenario;
  /** Weeks beyond the horizon the scheduler may use before giving up. */
  overflowWeeks?: number;
  /** Weeks fixed by hand. Placed first; the rest of the schedule works around them. */
  pins?: Pin[];
  /** Capacity cuts to respect while solving, from urgent maintenance. */
  disruptions?: Disruption[];
}

/** A pin the scheduler could not honour, and why. */
export interface RejectedPin extends Pin {
  reason: string;
}

/** What one location-week currently holds. */
interface Slot {
  /** Possession label to the activities sharing it. */
  possessions: Map<string, string[]>;
}

interface WeekLoad {
  /** access_night index to the activities running on it. */
  nights: Map<number, Set<string>>;
}

const DEFAULT_OVERFLOW_WEEKS = 26;

/** Local copy of the disruption predicate, to keep the import surface small. */
function appliesToLocationWeek(
  disruption: Disruption,
  locationId: string,
  week: number,
): boolean {
  if (disruption.locationId !== locationId) return false;
  if (week < disruption.fromWeek) return false;
  return disruption.toWeek === undefined || week <= disruption.toWeek;
}

function contractWeight(contract: Contract): number {
  return contract.contractPriority === 1 ? 100 : contract.contractPriority === 2 ? 10 : 1;
}

/**
 * Order of attack: most expensive contract tier first, then the activity's own
 * priority, then the longest jobs, then the earliest planned start. Long jobs go
 * early because they need the most distinct weeks and are hardest to fit later.
 */
function scheduleOrder(instance: Ps1Instance): Activity[] {
  const contractByNumber = new Map(instance.contracts.map((c) => [c.contractNumber, c]));
  return [...instance.activities].sort((a, b) => {
    const ca = contractByNumber.get(a.contractNumber)!;
    const cb = contractByNumber.get(b.contractNumber)!;
    return (
      contractWeight(cb) - contractWeight(ca) ||
      a.activityPriority - b.activityPriority ||
      b.totalAccesses - a.totalAccesses ||
      a.plannedStartDate.localeCompare(b.plannedStartDate) ||
      a.activityId.localeCompare(b.activityId)
    );
  });
}

export function scheduleInstance(
  instance: Ps1Instance,
  options: ScheduleOptions,
  network: Network = buildNetwork(instance),
): Submission & { rejectedPins: RejectedPin[] } {
  const { scenario } = options;
  const overflow = options.overflowWeeks ?? DEFAULT_OVERFLOW_WEEKS;
  const lastWeek = instance.parameters.horizonWeeks + overflow;
  const contractByNumber = new Map(instance.contracts.map((c) => [c.contractNumber, c]));

  const slots = new Map<string, Slot>();
  const loads = new Map<string, WeekLoad>();
  const access: AccessRow[] = [];
  const occupancy: OccupancyRow[] = [];

  const slotAt = (locationId: string, week: number): Slot => {
    const key = `${locationId}|${week}`;
    const existing = slots.get(key);
    if (existing) return existing;
    const created: Slot = { possessions: new Map() };
    slots.set(key, created);
    return created;
  };
  const loadAt = (contract: Contract, activityType: string, week: number): WeekLoad => {
    const key = `${contract.contractNumber}|${activityType}|${week}`;
    const existing = loads.get(key);
    if (existing) return existing;
    const created: WeekLoad = { nights: new Map() };
    loads.set(key, created);
    return created;
  };

  const disruptions = options.disruptions ?? [];

  /**
   * Capacity the scenario permits at one location in one week.
   *
   * A disruption is a physical fact about the night, so it applies before the
   * scenario's elasticity rather than after: B may buy extra nights, but not at
   * a location that has been closed down to one.
   */
  const capacityFor = (locationId: string, week: number): number => {
    const supply = capacityAt(network, disruptions, locationId, week);
    // B pays for extra nights rather than slipping dates; C gets one per
    // location-week. A has no elasticity at all.
    const elastic = scenario === "B" ? supply + 2 : scenario === "C" ? supply + 1 : supply;
    // Never let elasticity exceed what the disruption physically left behind.
    return disruptions.some((d) => appliesToLocationWeek(d, locationId, week))
      ? supply
      : elastic;
  };

  /**
   * Can this activity take a possession at every location of its span in this
   * week, either by joining a compatible existing possession or opening a new
   * one? Returns the label to use per location, or null if the week is unusable.
   */
  function placementFor(
    activity: Activity,
    contract: Contract,
    span: string[],
    week: number,
  ): Map<string, string> | null {
    const chosen = new Map<string, string>();
    for (const locationId of span) {
      const slot = slotAt(locationId, week);
      let label: string | null = null;

      // Prefer co-sharing: it consumes no additional capacity, which is exactly
      // the lever the brief says increases nightly throughput.
      if (contract.accessType !== "PM") {
        for (const [candidate, members] of slot.possessions) {
          if (members.length >= MAX_ACTIVITIES_PER_POSSESSION) continue;
          const types = members.map(
            (id) =>
              contractByNumber.get(
                instance.activities.find((a) => a.activityId === id)!.contractNumber,
              )!.accessType,
          );
          if (types.includes("PM")) continue;
          // At most one host per possession.
          if (contract.accessType === "PC" && types.includes("PC")) continue;
          label = candidate;
          break;
        }
      }

      if (label === null) {
        if (slot.possessions.size >= capacityFor(locationId, week)) return null;
        label = `b${slot.possessions.size + 1}`;
      }
      chosen.set(locationId, label);
    }
    return chosen;
  }

  /** The access-night index to use, or null if the contract's week is full. */
  function nightFor(
    activity: Activity,
    contract: Contract,
    week: number,
  ): number | null {
    const load = loadAt(contract, activity.activityType, week);
    // Reuse a night that still has a free workfront before opening a new one:
    // nights are the scarce weekly resource, workfronts are free within them.
    for (const [night, members] of load.nights) {
      if (members.size < contract.numberOfWorkfronts) return night;
    }
    if (load.nights.size >= contract.numberOfMaximumAccessPerWeek) return null;
    return load.nights.size + 1;
  }

  const spanCache = new Map<string, string[]>();
  const spanFor = (activity: Activity): string[] => {
    const key = `${activity.startLocationId}->${activity.endLocationId}`;
    const cached = spanCache.get(key);
    if (cached) return cached;
    const span = expandSpan(network, activity.startLocationId, activity.endLocationId);
    spanCache.set(key, span);
    return span;
  };

  const placedWeeks = new Map<string, number[]>();
  const sequenceOf = new Map<string, number>();
  const rejectedPins: RejectedPin[] = [];

  /**
   * Commit one access-night. Shared by the pin pass and the greedy pass so a
   * pinned week is held to exactly the rules an ordinary week is.
   */
  function commit(
    activity: Activity,
    contract: Contract,
    span: string[],
    week: number,
    eclo: boolean,
  ): boolean {
    const night = nightFor(activity, contract, week);
    if (night === null) return false;
    const labels = placementFor(activity, contract, span, week);
    if (!labels) return false;

    const sequence = (sequenceOf.get(activity.activityId) ?? 0) + 1;
    sequenceOf.set(activity.activityId, sequence);
    access.push({
      activityId: activity.activityId,
      accessSeq: sequence,
      week,
      eclo: eclo ? 1 : 0,
      accessNight: night,
    });
    for (const [locationId, label] of labels) {
      const slot = slotAt(locationId, week);
      slot.possessions.set(label, [...(slot.possessions.get(label) ?? []), activity.activityId]);
      occupancy.push({ activityId: activity.activityId, week, locationId, coShareGroup: label });
    }
    const load = loadAt(contract, activity.activityType, week);
    load.nights.set(night, new Set([...(load.nights.get(night) ?? []), activity.activityId]));
    placedWeeks.set(activity.activityId, [...(placedWeeks.get(activity.activityId) ?? []), week]);
    return true;
  }

  // Pins first, in week order, so an earlier pin cannot be displaced by a later
  // one belonging to the same contract.
  for (const pin of [...(options.pins ?? [])].sort((a, b) => a.week - b.week)) {
    const activity = instance.activities.find((a) => a.activityId === pin.activityId);
    if (!activity) {
      rejectedPins.push({ ...pin, reason: `no activity ${pin.activityId} in this instance` });
      continue;
    }
    const contract = contractByNumber.get(activity.contractNumber)!;
    const plannedWeek = weekOf(instance.parameters.horizonStart, activity.plannedStartDate);
    if (pin.week < plannedWeek) {
      rejectedPins.push({
        ...pin,
        reason: `wk${pin.week} is before the planned start of ${activity.plannedStartDate} (wk${plannedWeek})`,
      });
      continue;
    }
    if (!commit(activity, contract, spanFor(activity), pin.week, pin.eclo === 1)) {
      rejectedPins.push({
        ...pin,
        reason: `wk${pin.week} had no free possession or access-night for ${activity.activityId}`,
      });
    }
  }

  for (const activity of scheduleOrder(instance)) {
    const contract = contractByNumber.get(activity.contractNumber)!;
    const span = spanFor(activity);
    let earliest = Math.max(1, weekOf(instance.parameters.horizonStart, activity.plannedStartDate));

    // A dependency must finish before its successor starts.
    if (activity.predecessorActivityId) {
      const predecessor = placedWeeks.get(activity.predecessorActivityId);
      if (predecessor?.length) earliest = Math.max(earliest, Math.max(...predecessor) + 1);
    }

    // Pinned weeks are already committed and already counted; the greedy pass
    // only tops the activity up to its full workload.
    const pinned = placedWeeks.get(activity.activityId) ?? [];
    const pinnedYield = access
      .filter((row) => row.activityId === activity.activityId)
      .reduce((sum, row) => sum + (row.eclo === 1 ? ECLO_YIELD : STANDARD_YIELD), 0);
    let remaining = activity.totalAccesses - pinnedYield;
    const taken = new Set(pinned);
    const deadlineWeek = weekOf(
      instance.parameters.horizonStart,
      contract.plannedCompletionDate,
    );

    for (let week = earliest; week <= lastWeek && remaining > 1e-9; week += 1) {
      // One access per week per activity, so a pinned week is not doubled up.
      if (taken.has(week)) continue;

      // ECLO is only legal in B and C, and is spent only when the date would
      // otherwise slip: at one access per week, an activity needs as many weeks
      // as it has accesses left, so it is behind exactly when it has more work
      // left than weeks remaining before its contract's planned completion.
      const weeksLeft = deadlineWeek - week + 1;
      const useEclo =
        scenario !== "A" &&
        remaining > STANDARD_YIELD &&
        remaining > weeksLeft &&
        ecloAllowed(scenario);

      if (!commit(activity, contract, span, week, useEclo)) continue;
      taken.add(week);
      remaining -= useEclo ? ECLO_YIELD : STANDARD_YIELD;
    }
  }

  return {
    scenario,
    access,
    occupancy,
    results: resultsFor(instance, access, scenario),
    rejectedPins,
  };
}

/**
 * Whether the scenario permits ECLO at all.
 *
 * Forbidden outright in A. Used in B, where dates are rigid and an overrun is a
 * hard failure, so buying 1.5 nights of yield is the only way to compress a
 * contract into its window.
 *
 * Deliberately unused in C. Rule 9 confines every `eclo=1` access affecting a
 * line to one continuous span of at most two calendar weeks, chosen per line,
 * and an activity gets at most one access per week — so C can buy at most two
 * ECLO nights per activity, and only for activities that happen to fall in the
 * same fortnight on both lines. Spreading them earned a hard `eclo_window`
 * violation in testing. The capacity allowance C grants instead, one excess
 * access-night per location-week, is both cheaper per unit (3x against 5x) and
 * free of a continuity constraint, so C leans on that and leaves ECLO alone.
 */
function ecloAllowed(scenario: Scenario): boolean {
  return scenario === "B";
}

/** Contract completion is the Sunday of its last scheduled week. */
export function resultsFor(
  instance: Ps1Instance,
  access: AccessRow[],
  scenario: Scenario,
): ResultRow[] {
  const activityById = new Map(instance.activities.map((a) => [a.activityId, a]));
  const lastWeek = new Map<string, number>();
  for (const row of access) {
    const contractNumber = activityById.get(row.activityId)!.contractNumber;
    lastWeek.set(contractNumber, Math.max(lastWeek.get(contractNumber) ?? 0, row.week));
  }
  return instance.contracts.map((contract) => {
    const week = lastWeek.get(contract.contractNumber);
    const simulated =
      week === undefined
        ? contract.plannedCompletionDate
        : isoDate(weekEnd(instance.parameters.horizonStart, week));
    const overrun = Math.max(
      0,
      Math.round(
        (new Date(`${simulated}T00:00:00Z`).getTime() -
          new Date(`${contract.plannedCompletionDate}T00:00:00Z`).getTime()) /
          86_400_000,
      ),
    );
    return {
      scenario,
      contractNumber: contract.contractNumber,
      simulatedCompletionDate: simulated,
      overrunDays: overrun,
    };
  });
}
