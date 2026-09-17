import {
  type Activity,
  type Contract,
  type Ps1Instance,
  type Submission,
} from "../types/ps1";
import { buildNetwork, expandSpan, type Network } from "./network";
import { MAX_ACTIVITIES_PER_POSSESSION, weekOf } from "./validate";

/**
 * Why an activity ended up in the week it did.
 *
 * The answer is produced by counterfactual, not by narration: take every week
 * between the one the activity was planned to start in and the one it actually
 * started in, put the activity there with the rest of the schedule held still,
 * and record what stopped it. Nothing here is authored prose about a particular
 * activity — the sentence is assembled from whatever the rules actually blocked.
 *
 * This is the difference between a tool that produces a schedule and one that
 * defends it. A works controller told "A031 slipped six weeks" will ask why, and
 * "the sector was full in four of those weeks and your contract had no nights
 * left in the other two" is an answer they can act on.
 */

export type BlockerKind =
  | "capacity"
  | "allocation"
  | "workfront"
  | "mix"
  | "predecessor"
  | "none";

/**
 * A dependency outranks everything else as an explanation.
 *
 * `blockerAt` probes capacity and allocation, which is the right question only
 * once the activity is allowed to start at all. While its predecessor is still
 * running, an empty network would not have let it start any earlier, so a week
 * in that stretch is a predecessor week whatever else was also busy — reporting
 * it as "no rule blocked this week" underneath a summary that blames the
 * predecessor is the panel contradicting itself.
 */
function predecessorBlockerAt(
  activity: Activity,
  finishes: number,
  week: number,
): WeekBlocker {
  return {
    week,
    kind: "predecessor",
    subject: activity.predecessorActivityId!,
    detail: `${activity.predecessorActivityId} was still running; it finishes in wk${finishes}`,
  };
}

export interface WeekBlocker {
  week: number;
  kind: BlockerKind;
  /** The specific location or contract that blocked it, where there is one. */
  subject: string;
  detail: string;
}

export interface PlacementExplanation {
  activityId: string;
  contractNumber: string;
  /** The week the activity's planned start date falls in. */
  plannedWeek: number;
  /** The week its first access was actually scheduled in, if any. */
  actualWeek: number | null;
  weeksSlipped: number;
  /** One entry per week between planned and actual, in order. */
  blockers: WeekBlocker[];
  /** Ordered facts backing the summary, for a panel to render as rows. */
  facts: { label: string; value: string }[];
  summary: string;
}

/** The occupancy state of a schedule, indexed for counterfactual probing. */
interface SchedulState {
  /** location|week to possession label to member activity ids. */
  slots: Map<string, Map<string, string[]>>;
  /** contract|type|week to access-night index to member activity ids. */
  loads: Map<string, Map<number, Set<string>>>;
}

function buildState(instance: Ps1Instance, submission: Submission): SchedulState {
  const activityById = new Map(instance.activities.map((a) => [a.activityId, a]));
  const slots = new Map<string, Map<string, string[]>>();
  for (const row of submission.occupancy) {
    const key = `${row.locationId}|${row.week}`;
    const slot = slots.get(key) ?? new Map<string, string[]>();
    slot.set(row.coShareGroup, [...(slot.get(row.coShareGroup) ?? []), row.activityId]);
    slots.set(key, slot);
  }
  const loads = new Map<string, Map<number, Set<string>>>();
  for (const row of submission.access) {
    const activity = activityById.get(row.activityId);
    if (!activity) continue;
    const key = `${activity.contractNumber}|${activity.activityType}|${row.week}`;
    const load = loads.get(key) ?? new Map<number, Set<string>>();
    const members = load.get(row.accessNight) ?? new Set<string>();
    members.add(row.activityId);
    load.set(row.accessNight, members);
    loads.set(key, load);
  }
  return { slots, loads };
}

/**
 * What would have stopped this activity from taking an access in this week,
 * with the rest of the schedule unchanged.
 *
 * The activity's own placements are excluded from the state it is probed
 * against, so an activity is never reported as blocking itself.
 */
function blockerAt(
  instance: Ps1Instance,
  network: Network,
  state: SchedulState,
  activity: Activity,
  contract: Contract,
  span: string[],
  week: number,
): WeekBlocker {
  const activityById = new Map(instance.activities.map((a) => [a.activityId, a]));
  const contractByNumber = new Map(instance.contracts.map((c) => [c.contractNumber, c]));

  // Contract allocation: are there nights left in this week at all?
  const loadKey = `${contract.contractNumber}|${activity.activityType}|${week}`;
  const load = state.loads.get(loadKey) ?? new Map<number, Set<string>>();
  const others = [...load].map(
    ([night, members]) =>
      [night, new Set([...members].filter((id) => id !== activity.activityId))] as const,
  );
  const openNights = others.filter(([, members]) => members.size > 0);
  const hasRoomOnExistingNight = openNights.some(
    ([, members]) => members.size < contract.numberOfWorkfronts,
  );
  if (!hasRoomOnExistingNight && openNights.length >= contract.numberOfMaximumAccessPerWeek) {
    return {
      week,
      kind: "allocation",
      subject: contract.contractNumber,
      detail: `${contract.contractNumber} had all ${contract.numberOfMaximumAccessPerWeek} of its weekly access-nights committed`,
    };
  }
  if (
    !hasRoomOnExistingNight &&
    openNights.length > 0 &&
    openNights.length >= contract.numberOfMaximumAccessPerWeek
  ) {
    return {
      week,
      kind: "workfront",
      subject: contract.contractNumber,
      detail: `${contract.contractNumber} was already running ${contract.numberOfWorkfronts} concurrent workfronts`,
    };
  }

  // Location capacity: is there a free possession, or a compatible one to join?
  for (const locationId of span) {
    const supply = network.supply.get(locationId)!.supplyCapacity;
    const slot = state.slots.get(`${locationId}|${week}`) ?? new Map<string, string[]>();
    const labels = [...slot].filter(([, members]) =>
      members.some((id) => id !== activity.activityId),
    );
    if (labels.length < supply) continue;

    // Full. Could it have co-shared into one of the existing possessions?
    if (contract.accessType === "PM") {
      return {
        week,
        kind: "capacity",
        subject: locationId,
        detail: `${locationId} was full at ${labels.length}/${supply} possessions, and a PM possession cannot share`,
      };
    }
    const joinable = labels.some(([, members]) => {
      const types = members
        .filter((id) => id !== activity.activityId)
        .map((id) => contractByNumber.get(activityById.get(id)!.contractNumber)!.accessType);
      if (types.length >= MAX_ACTIVITIES_PER_POSSESSION) return false;
      if (types.includes("PM")) return false;
      if (contract.accessType === "PC" && types.includes("PC")) return false;
      return true;
    });
    if (!joinable) {
      return {
        week,
        kind: labels.length >= supply ? "capacity" : "mix",
        subject: locationId,
        detail: `${locationId} was full at ${labels.length}/${supply} possessions with no compatible slot to co-share`,
      };
    }
  }

  return { week, kind: "none", subject: "", detail: "no rule blocked this week" };
}

export function explainPlacement(
  instance: Ps1Instance,
  submission: Submission,
  activityId: string,
  network: Network = buildNetwork(instance),
): PlacementExplanation | null {
  const activity = instance.activities.find((a) => a.activityId === activityId);
  if (!activity) return null;
  const contract = instance.contracts.find(
    (c) => c.contractNumber === activity.contractNumber,
  )!;

  const rows = submission.access
    .filter((row) => row.activityId === activityId)
    .sort((a, b) => a.week - b.week);
  const plannedWeek = Math.max(
    1,
    weekOf(instance.parameters.horizonStart, activity.plannedStartDate),
  );
  const actualWeek = rows.length ? rows[0].week : null;
  const weeksSlipped = actualWeek === null ? 0 : Math.max(0, actualWeek - plannedWeek);

  const state = buildState(instance, submission);
  const span = expandSpan(network, activity.startLocationId, activity.endLocationId);

  // Established before the week-by-week probe, because it decides which weeks
  // are worth probing at all.
  let predecessorFinish: number | null = null;
  if (activity.predecessorActivityId) {
    const predecessorWeeks = submission.access
      .filter((row) => row.activityId === activity.predecessorActivityId)
      .map((row) => row.week);
    if (predecessorWeeks.length) predecessorFinish = Math.max(...predecessorWeeks);
  }
  const predecessorBlock =
    predecessorFinish !== null && predecessorFinish >= plannedWeek
      ? `${activity.predecessorActivityId} had to finish first, in wk${predecessorFinish}`
      : null;

  const blockers: WeekBlocker[] = [];
  if (actualWeek !== null && weeksSlipped > 0) {
    for (let week = plannedWeek; week < actualWeek; week += 1) {
      blockers.push(
        predecessorFinish !== null && week <= predecessorFinish
          ? predecessorBlockerAt(activity, predecessorFinish, week)
          : blockerAt(instance, network, state, activity, contract, span, week),
      );
    }
  }

  const facts: { label: string; value: string }[] = [
    { label: "Contract", value: `${contract.contractNumber} (priority ${contract.contractPriority}, ${contract.accessType})` },
    { label: "Span", value: `${activity.startLocationId} to ${activity.endLocationId}` },
    { label: "Workload", value: `${activity.totalAccesses} access-nights` },
    { label: "Planned start", value: `${activity.plannedStartDate} (wk${plannedWeek})` },
    {
      label: "Scheduled",
      value:
        actualWeek === null
          ? "not scheduled"
          : `wk${actualWeek}${weeksSlipped > 0 ? ` — ${weeksSlipped} week${weeksSlipped === 1 ? "" : "s"} later` : " — on its planned week"}`,
    },
  ];
  if (rows.length > 1) {
    facts.push({ label: "Weeks used", value: rows.map((row) => `wk${row.week}`).join(", ") });
  }
  const ecloNights = rows.filter((row) => row.eclo === 1).length;
  if (ecloNights) {
    facts.push({
      label: "Early closure",
      value: `${ecloNights} night${ecloNights === 1 ? "" : "s"}, yielding 1.5 each`,
    });
  }

  return {
    activityId,
    contractNumber: contract.contractNumber,
    plannedWeek,
    actualWeek,
    weeksSlipped,
    blockers,
    facts,
    summary: summarise(activity, plannedWeek, actualWeek, weeksSlipped, predecessorBlock, blockers),
  };
}

/** The clauses naming what stopped a set of weeks, busiest cause first. */
function reasons(blockers: WeekBlocker[]): string[] {
  const counts = new Map<BlockerKind, number>();
  for (const blocker of blockers) {
    counts.set(blocker.kind, (counts.get(blocker.kind) ?? 0) + 1);
  }
  const parts: string[] = [];
  const capacity = counts.get("capacity") ?? 0;
  const allocation = counts.get("allocation") ?? 0;
  const workfront = counts.get("workfront") ?? 0;
  const mix = counts.get("mix") ?? 0;

  if (capacity) {
    // Name the location that blocked most often; it is the actual bottleneck.
    const tally = new Map<string, number>();
    for (const blocker of blockers) {
      if (blocker.kind !== "capacity") continue;
      tally.set(blocker.subject, (tally.get(blocker.subject) ?? 0) + 1);
    }
    const worst = [...tally].sort((a, b) => b[1] - a[1])[0];
    parts.push(`${worst[0]} was full in ${capacity} of those week${capacity === 1 ? "" : "s"}`);
  }
  if (allocation) parts.push(`its contract had no access-nights left in ${allocation} of them`);
  if (workfront) parts.push(`its workfronts were committed in ${workfront}`);
  if (mix) parts.push(`no compatible possession was available in ${mix}`);
  return parts;
}

function summarise(
  activity: Activity,
  plannedWeek: number,
  actualWeek: number | null,
  weeksSlipped: number,
  predecessorBlock: string | null,
  blockers: WeekBlocker[],
): string {
  if (actualWeek === null) return `${activity.activityId} was not scheduled.`;
  if (weeksSlipped === 0) {
    return `${activity.activityId} started in wk${actualWeek}, the week it was planned for.`;
  }

  if (predecessorBlock) {
    // The dependency explains its own weeks. Anything that held the activity up
    // *after* the predecessor cleared is a second reason, and dropping it would
    // leave the blocker rows below saying more than the sentence above them.
    const after = blockers.filter((blocker) => blocker.kind !== "predecessor");
    const later = reasons(after);
    const free = after.filter((blocker) => blocker.kind === "none").length;
    let tail = "";
    if (later.length) {
      tail = ` It then waited ${after.length} week${after.length === 1 ? "" : "s"} more because ${later.join(", and ")}.`;
    } else if (free) {
      tail = ` The ${free} week${free === 1 ? "" : "s"} after that ${free === 1 ? "was" : "were"} free, so higher-priority work took ${free === 1 ? "it" : "them"}.`;
    }
    return `${activity.activityId} started in wk${actualWeek} rather than wk${plannedWeek} because ${predecessorBlock}.${tail}`;
  }

  const parts = reasons(blockers);
  const unexplained = blockers.filter((blocker) => blocker.kind === "none").length;

  if (!parts.length) {
    // Slipped without any rule blocking it: the scheduler chose to place more
    // expensive work first. Saying so is more honest than inventing a blocker.
    return `${activity.activityId} started in wk${actualWeek} rather than wk${plannedWeek}; no rule blocked the earlier weeks, so higher-priority work was placed there first.`;
  }

  const tail = unexplained
    ? ` The remaining ${unexplained} week${unexplained === 1 ? " was" : "s were"} free, so higher-priority work took them.`
    : "";
  return `${activity.activityId} slipped ${weeksSlipped} week${weeksSlipped === 1 ? "" : "s"} from wk${plannedWeek} to wk${actualWeek} because ${parts.join(", and ")}.${tail}`;
}
