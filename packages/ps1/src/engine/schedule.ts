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
  type SolveOutcome,
  type Submission,
} from "../types/ps1";
import { buildNetwork, expandSpan, type Network } from "./network";
import {
  isoDate,
  weekEnd,
  weekOf,
  MAX_ACTIVITIES_PER_POSSESSION,
  validate,
} from "./validate";
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
  /** Weeks fixed by hand. Placed first; the rest of the schedule works around them. */
  pins?: Pin[];
  /** Capacity cuts to respect while solving, from urgent maintenance. */
  disruptions?: Disruption[];
  /** Deterministic construction variant used by the multi-start optimiser. */
  constructionSeed?: number;
  optimizationBudget?: {
    starts?: number;
    maxNeighbourEvaluations?: number;
  };
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
function scheduleOrder(instance: Ps1Instance, seed = 0): Activity[] {
  const contractByNumber = new Map(instance.contracts.map((c) => [c.contractNumber, c]));
  const rank = (a: Activity, b: Activity): number => {
    const ca = contractByNumber.get(a.contractNumber)!;
    const cb = contractByNumber.get(b.contractNumber)!;
    const deadline = ca.plannedCompletionDate.localeCompare(cb.plannedCompletionDate);
    const planned = a.plannedStartDate.localeCompare(b.plannedStartDate);
    const variant = seed % 6;
    const orders = [
      contractWeight(cb) - contractWeight(ca) || a.activityPriority - b.activityPriority,
      deadline || contractWeight(cb) - contractWeight(ca),
      b.totalAccesses - a.totalAccesses || deadline,
      planned || contractWeight(cb) - contractWeight(ca),
      a.activityPriority - b.activityPriority || b.totalAccesses - a.totalAccesses,
      contractWeight(cb) - contractWeight(ca) || deadline || planned,
    ];
    return orders[variant] || b.totalAccesses - a.totalAccesses || a.activityId.localeCompare(b.activityId);
  };

  // Kahn's algorithm makes dependency order structural rather than accidental.
  const byId = new Map(instance.activities.map((activity) => [activity.activityId, activity]));
  const children = new Map<string, Activity[]>();
  const indegree = new Map<string, number>();
  for (const activity of instance.activities) {
    indegree.set(activity.activityId, activity.predecessorActivityId ? 1 : 0);
    if (activity.predecessorActivityId) {
      const list = children.get(activity.predecessorActivityId) ?? [];
      list.push(activity);
      children.set(activity.predecessorActivityId, list);
    }
  }
  const ready = instance.activities.filter((activity) => !activity.predecessorActivityId);
  const ordered: Activity[] = [];
  while (ready.length) {
    ready.sort(rank);
    const chosen = ready.shift()!;
    ordered.push(chosen);
    for (const child of children.get(chosen.activityId) ?? []) {
      const next = (indegree.get(child.activityId) ?? 1) - 1;
      indegree.set(child.activityId, next);
      if (next === 0) ready.push(child);
    }
  }
  if (ordered.length !== byId.size) throw new Error("Activity predecessor graph contains a cycle");
  return ordered;
}

export function scheduleInstance(
  instance: Ps1Instance,
  options: ScheduleOptions,
  network: Network = buildNetwork(instance),
): Submission & { rejectedPins: RejectedPin[] } {
  const { scenario } = options;
  const lastWeek = instance.parameters.horizonWeeks;
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
    const elastic = scenario === "B" ? Number.POSITIVE_INFINITY : scenario === "C" ? supply + 1 : supply;
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

  for (const activity of scheduleOrder(instance, options.constructionSeed ?? 0)) {
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
        ecloAllowed(scenario, contract, options.constructionSeed ?? 0);

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
function ecloAllowed(scenario: Scenario, contract: Contract, seed: number): boolean {
  if (scenario === "B") return true;
  if (scenario !== "C") return false;
  // Half the construction starts retain the proven no-ECLO baseline. The
  // others may buy ECLO only where avoiding a week of delay can beat its cost.
  return seed % 2 === 1 && contractWeight(contract) * 7 > 2 * 5;
}

/**
 * Deterministic multi-start optimisation with a bounded reconstruction search.
 * Every candidate passes through the independent validator; rejected pins make
 * an otherwise feasible candidate non-applicable.
 */
export function solveInstance(
  instance: Ps1Instance,
  options: ScheduleOptions,
  network?: Network,
): SolveOutcome {
  const started = Date.now();
  let activeNetwork: Network;
  try {
    activeNetwork = network ?? buildNetwork(instance);
  } catch (cause) {
    return {
      status: "INVALID_INSTANCE",
      diagnostics: {
        startsTried: 0,
        candidatesEvaluated: 0,
        elapsedMs: Date.now() - started,
        warnings: [cause instanceof Error ? cause.message : String(cause)],
        rejectedPins: [],
      },
    };
  }
  const starts = Math.max(1, Math.min(24, options.optimizationBudget?.starts ?? 24));
  const neighbourBudget = Math.max(
    0,
    Math.min(2_500, options.optimizationBudget?.maxNeighbourEvaluations ?? 2_500),
  );
  let candidatesEvaluated = 0;
  let best:
    | { submission: Submission & { rejectedPins: RejectedPin[] }; report: ReturnType<typeof validate> }
    | undefined;

  const consider = (submission: Submission & { rejectedPins: RejectedPin[] }) => {
    candidatesEvaluated += 1;
    const report = validate(instance, submission, activeNetwork, options.disruptions ?? []);
    if (!report.feasible || submission.rejectedPins.length > 0) return;
    const score = report.objectiveScore ?? Number.POSITIVE_INFINITY;
    const bestScore = best?.report.objectiveScore ?? Number.POSITIVE_INFINITY;
    const stable = JSON.stringify(submission.access);
    const bestStable = best ? JSON.stringify(best.submission.access) : "";
    if (!best || score < bestScore || (score === bestScore && stable < bestStable)) {
      best = { submission, report };
    }
  };

  for (let seed = 0; seed < starts; seed += 1) {
    consider(scheduleInstance(instance, { ...options, constructionSeed: seed }, activeNetwork));
  }

  // Shift selected accesses one week either side and reconstruct around that
  // hard choice. Reconstruction naturally exercises swaps, re-packing, ECLO
  // and excess-possession alternatives without mutating a candidate in place.
  if (best && neighbourBudget > 0) {
    const baseline = best.submission;
    const rows = [...baseline.access]
      .sort((a, b) => b.week - a.week || a.activityId.localeCompare(b.activityId))
      .slice(0, Math.min(48, baseline.access.length));
    let neighbours = 0;
    for (const row of rows) {
      for (const delta of [-1, 1]) {
        if (neighbours >= neighbourBudget) break;
        const week = row.week + delta;
        if (week < 1 || week > instance.parameters.horizonWeeks) continue;
        const originalPins = options.pins ?? [];
        if (originalPins.some((pin) => pin.activityId === row.activityId && pin.week !== row.week)) {
          continue;
        }
        consider(
          scheduleInstance(
            instance,
            {
              ...options,
              constructionSeed: neighbours % starts,
              pins: [
                ...originalPins.filter(
                  (pin) => !(pin.activityId === row.activityId && pin.week === row.week),
                ),
                { activityId: row.activityId, week, eclo: row.eclo },
              ],
            },
            activeNetwork,
          ),
        );
        neighbours += 1;
      }
    }
  }

  const rejectedPins = best?.submission.rejectedPins ?? [];
  if (!best) {
    const diagnostic = scheduleInstance(instance, { ...options, constructionSeed: 0 }, activeNetwork);
    const validation = validate(instance, diagnostic, activeNetwork, options.disruptions ?? []);
    return {
      status: "INFEASIBLE",
      submission: diagnostic,
      validation,
      diagnostics: {
        startsTried: starts,
        candidatesEvaluated,
        elapsedMs: Date.now() - started,
        warnings: [
          "No complete, locally conforming schedule was found inside the declared horizon.",
        ],
        rejectedPins: diagnostic.rejectedPins,
      },
    };
  }

  return {
    status: "FEASIBLE",
    submission: best.submission,
    validation: best.report,
    diagnostics: {
      startsTried: starts,
      candidatesEvaluated,
      elapsedMs: Date.now() - started,
      warnings: [],
      rejectedPins,
    },
  };
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
