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

export interface ScheduleOptions {
  scenario: Scenario;
  /** Weeks beyond the horizon the scheduler may use before giving up. */
  overflowWeeks?: number;
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
): Submission {
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

  /** Capacity the scenario permits at one location, including its allowance. */
  const capacityFor = (locationId: string): number => {
    const supply = network.supply.get(locationId)!.supplyCapacity;
    // B pays for extra nights rather than slipping dates; C gets one per
    // location-week. A has no elasticity at all.
    if (scenario === "B") return supply + 2;
    if (scenario === "C") return supply + 1;
    return supply;
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
        if (slot.possessions.size >= capacityFor(locationId)) return null;
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

  for (const activity of scheduleOrder(instance)) {
    const contract = contractByNumber.get(activity.contractNumber)!;
    const span = spanFor(activity);
    let earliest = Math.max(1, weekOf(instance.parameters.horizonStart, activity.plannedStartDate));

    // A dependency must finish before its successor starts.
    if (activity.predecessorActivityId) {
      const predecessor = placedWeeks.get(activity.predecessorActivityId);
      if (predecessor?.length) earliest = Math.max(earliest, Math.max(...predecessor) + 1);
    }

    let remaining = activity.totalAccesses;
    let sequence = 1;
    const weeksUsed: number[] = [];
    const deadlineWeek = weekOf(
      instance.parameters.horizonStart,
      contract.plannedCompletionDate,
    );

    for (let week = earliest; week <= lastWeek && remaining > 1e-9; week += 1) {
      const night = nightFor(activity, contract, week);
      if (night === null) continue;
      const labels = placementFor(activity, contract, span, week);
      if (!labels) continue;

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

      access.push({
        activityId: activity.activityId,
        accessSeq: sequence,
        week,
        eclo: useEclo ? 1 : 0,
        accessNight: night,
      });
      for (const [locationId, label] of labels) {
        const slot = slotAt(locationId, week);
        slot.possessions.set(label, [...(slot.possessions.get(label) ?? []), activity.activityId]);
        occupancy.push({ activityId: activity.activityId, week, locationId, coShareGroup: label });
      }
      const load = loadAt(contract, activity.activityType, week);
      load.nights.set(night, new Set([...(load.nights.get(night) ?? []), activity.activityId]));

      remaining -= useEclo ? ECLO_YIELD : STANDARD_YIELD;
      sequence += 1;
      weeksUsed.push(week);
    }

    placedWeeks.set(activity.activityId, weeksUsed);
  }

  return {
    scenario,
    access,
    occupancy,
    results: resultsFor(instance, access, scenario),
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
