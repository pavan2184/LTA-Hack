import { literalWorld, type PlanningWorld } from "../domain/world";
import { findOverloads, formatSpan, type Interval } from "../engine/intervals";
import type { MaintenanceRequest, Plan, Placement, Violation, ViolationRuleId } from "../types/railplan";

export const CONSTRAINT_VERSION = "constraints-v2";

/**
 * The rule catalogue. Every violation the validator can emit is declared here,
 * so the UI can explain a rule without the engine having to ship prose with
 * each finding.
 */
export const ruleCatalogue: Record<ViolationRuleId, { label: string; description: string }> = {
  BLOCK_CAPACITY: {
    label: "Track block capacity",
    description: "More jobs occupy an atomic track block at once than the block permits.",
  },
  CONFLICT_ZONE: {
    label: "Conflict zone",
    description:
      "Two jobs hold an isolation or crossover area that operating rules allow only one job to hold.",
  },
  ADJACENT_WORK: {
    label: "Adjacent work",
    description: "Incompatible work runs on neighbouring blocks within the required separation.",
  },
  TEAM_CAPACITY: {
    label: "Team availability",
    description: "A team is assigned to more concurrent jobs than it has crews.",
  },
  EQUIPMENT_CAPACITY: {
    label: "Equipment availability",
    description: "Concurrent demand for an asset exceeds the number of serviceable units.",
  },
  SKILL_COVERAGE: {
    label: "Skill coverage",
    description: "The assigned team is not qualified for the work.",
  },
  WORK_COMPATIBILITY: {
    label: "Work compatibility",
    description: "Two work classes that cannot share an isolation are scheduled together.",
  },
  DEPENDENCY_ORDER: {
    label: "Dependency order",
    description: "A job starts before its predecessor has finished and been handed back.",
  },
  TIME_WINDOW: {
    label: "Permitted window",
    description: "A job falls outside the window its requester permitted.",
  },
  HANDBACK: {
    label: "Handback deadline",
    description: "Work plus its clearance time runs past the end of the engineering window.",
  },
  TRAVEL_TIME: {
    label: "Travel time",
    description: "A team cannot reach its next job in the gap left between the two.",
  },
  SHIFT_AVAILABILITY: {
    label: "Shift availability",
    description: "A job falls outside the assigned team's shift.",
  },
};

export interface ValidationContext {
  /**
   * The night being validated against: topology, resources, requests, window.
   *
   * Defaults to the world this package's literals describe, which is what keeps
   * every existing caller working. A caller that has loaded a night out of
   * Postgres passes its own world here, and the rules below are then evaluated
   * against *that* night rather than against whichever literals happen to be
   * compiled into the process. That distinction is the whole point: a validator
   * that can only check the plans it already agrees with is not a gate.
   */
  world?: PlanningWorld;
  /**
   * Requests that are not in the standing dataset — emergency insertions and
   * what-if jobs. Validated by exactly the same rules as everything else.
   */
  extraRequests?: Record<string, MaintenanceRequest>;
  /** Blocks removed from service, e.g. by a disruption. */
  closedBlockIds?: string[];
  /** Teams unavailable from a given minute onwards. */
  unavailableTeams?: { teamId: string; fromMinute: number }[];
  /** Overrides the handback deadline, e.g. a shortened window. */
  windowEnd?: number;
  /** Extra minutes added to a specific job, e.g. an overrun. */
  overrun?: { requestId: string; minutes: number };
}

interface Job {
  request: MaintenanceRequest;
  placement: Placement;
  /** Work interval: when crews and assets are committed. */
  work: Interval;
  /** Occupancy interval: work plus clearance, when the block is unavailable. */
  occupancy: Interval;
}

function buildJobs(plan: Plan, context: ValidationContext, world: PlanningWorld): Job[] {
  return plan.placements
    .map((placement) => {
      const request =
        context.extraRequests?.[placement.requestId] ?? world.requestById[placement.requestId];
      if (!request) return null;
      const extra = context.overrun?.requestId === placement.requestId ? context.overrun.minutes : 0;
      const end = placement.endMinute + extra;
      return {
        request,
        placement,
        work: { requestId: request.id, start: placement.startMinute, end },
        occupancy: {
          requestId: request.id,
          start: placement.startMinute,
          end: end + request.clearanceMinutes,
        },
      } satisfies Job;
    })
    .filter((job): job is Job => job !== null)
    .sort((a, b) => a.work.start - b.work.start || a.request.id.localeCompare(b.request.id));
}

/**
 * Validate a plan against every hard constraint.
 *
 * Pure: same plan and context in, same violations out, in the same order. This
 * function is the only authority on whether a plan is feasible. The solver
 * calls it; the UI calls it again on the solver's output; the tests call it on
 * generated plans. Nothing is allowed to assert feasibility without it.
 */
export function validate(plan: Plan, context: ValidationContext = {}): Violation[] {
  const world = context.world ?? literalWorld();
  const jobs = buildJobs(plan, context, world);
  const windowEnd = context.windowEnd ?? world.windowEnd;
  const raw: Omit<Violation, "id">[] = [];

  raw.push(...checkWindows(jobs, windowEnd, world));
  raw.push(...checkBlockCapacity(jobs, context, world));
  raw.push(...checkConflictZones(jobs, world));
  raw.push(...checkAdjacentWork(jobs, world));
  raw.push(...checkWorkCompatibility(jobs, world));
  raw.push(...checkTeams(jobs, context, world));
  raw.push(...checkEquipment(jobs, world));
  raw.push(...checkSkills(jobs, world));
  raw.push(...checkDependencies(jobs, plan));
  raw.push(...checkTravel(jobs, world));

  return dedupe(raw);
}

/** True when a plan has no critical violations. Warnings do not block release. */
export function isFeasible(violations: Violation[]): boolean {
  return violations.every((violation) => violation.severity !== "critical");
}

// --- individual rules -------------------------------------------------------

function checkWindows(jobs: Job[], windowEnd: number, world: PlanningWorld): Omit<Violation, "id">[] {
  const found: Omit<Violation, "id">[] = [];
  jobs.forEach(({ request, work, occupancy }) => {
    if (work.start < request.earliestStart) {
      found.push({
        ruleId: "TIME_WINDOW",
        severity: "critical",
        requestIds: [request.id],
        title: `${request.id} starts before its permitted window`,
        detail: `${request.id} is placed at ${formatSpan(work.start, work.end)} but may not start before ${formatSpan(request.earliestStart, request.earliestStart)}.`,
        subjects: ["permitted window"],
        observed: formatSpan(work.start, work.end),
        required: `start at or after ${formatSpan(request.earliestStart, request.earliestStart).split("-")[0]}`,
        shortfallMinutes: request.earliestStart - work.start,
        window: { start: work.start, end: Math.min(request.earliestStart, work.end) },
        remedy: `Move ${request.id} later by ${request.earliestStart - work.start} minutes.`,
      });
    }
    if (work.end > request.latestEnd) {
      found.push({
        ruleId: "TIME_WINDOW",
        severity: "critical",
        requestIds: [request.id],
        title: `${request.id} runs past its permitted end`,
        detail: `${request.id} ends at ${formatSpan(work.end, work.end).split("-")[0]} but must finish by ${formatSpan(request.latestEnd, request.latestEnd).split("-")[0]}.`,
        subjects: ["permitted window"],
        observed: formatSpan(work.start, work.end),
        required: `finish by ${formatSpan(request.latestEnd, request.latestEnd).split("-")[0]}`,
        shortfallMinutes: work.end - request.latestEnd,
        window: { start: Math.max(request.latestEnd, work.start), end: work.end },
        remedy: `Start ${request.id} at least ${work.end - request.latestEnd} minutes earlier.`,
      });
    }
    if (occupancy.end > windowEnd) {
      found.push({
        ruleId: "HANDBACK",
        severity: "critical",
        requestIds: [request.id],
        title: `${request.id} misses the handback deadline`,
        detail: `${request.id} occupies track until ${formatSpan(occupancy.end, occupancy.end).split("-")[0]} once its ${request.clearanceMinutes}-minute clearance is added. The window closes at ${formatSpan(windowEnd, windowEnd).split("-")[0]}.`,
        subjects: ["engineering window"],
        observed: `track clear at ${formatSpan(occupancy.end, occupancy.end).split("-")[0]}`,
        required: `track clear by ${formatSpan(windowEnd, windowEnd).split("-")[0]}`,
        shortfallMinutes: occupancy.end - windowEnd,
        window: { start: Math.max(windowEnd, occupancy.start), end: occupancy.end },
        remedy: `Start ${request.id} ${occupancy.end - windowEnd} minutes earlier or defer it.`,
      });
    }
    if (work.start < world.windowStart) {
      found.push({
        ruleId: "TIME_WINDOW",
        severity: "critical",
        requestIds: [request.id],
        title: `${request.id} starts before the engineering window`,
        detail: `${request.id} starts at ${formatSpan(work.start, work.start).split("-")[0]}, before the window opens.`,
        subjects: ["engineering window"],
        observed: formatSpan(work.start, work.end),
        required: `start at or after ${formatSpan(world.windowStart, world.windowStart).split("-")[0]}`,
        shortfallMinutes: world.windowStart - work.start,
        window: { start: work.start, end: Math.min(world.windowStart, work.end) },
        remedy: `Move ${request.id} into the window.`,
      });
    }
  });
  return found;
}

function checkBlockCapacity(jobs: Job[], context: ValidationContext, world: PlanningWorld): Omit<Violation, "id">[] {
  const found: Omit<Violation, "id">[] = [];
  const closed = new Set(context.closedBlockIds ?? []);
  const byBlock = new Map<string, Interval[]>();

  jobs.forEach((job) => {
    job.request.blockIds.forEach((blockId) => {
      if (!byBlock.has(blockId)) byBlock.set(blockId, []);
      byBlock.get(blockId)!.push(job.occupancy);
    });
  });

  byBlock.forEach((intervals, blockId) => {
    const block = world.blockById[blockId];
    const capacity = closed.has(blockId) ? 0 : (block?.capacity ?? 1);

    if (capacity === 0) {
      const ids = [...new Set(intervals.map((i) => i.requestId))].sort();
      found.push({
        ruleId: "BLOCK_CAPACITY",
        severity: "critical",
        requestIds: ids,
        title: `${blockId} is closed but still occupied`,
        detail: `${ids.join(" and ")} occupy ${blockId}, which is out of service.`,
        subjects: [blockId],
        observed: `${ids.length} jobs on a closed block`,
        required: "0 jobs",
        shortfallMinutes: intervals.reduce((sum, i) => sum + (i.end - i.start), 0),
        window: {
          start: Math.min(...intervals.map((i) => i.start)),
          end: Math.max(...intervals.map((i) => i.end)),
        },
        remedy: `Move ${ids.join(" and ")} off ${blockId}.`,
      });
      return;
    }

    findOverloads(intervals, capacity).forEach((overload) => {
      const minutes = overload.end - overload.start;
      found.push({
        ruleId: "BLOCK_CAPACITY",
        severity: "critical",
        requestIds: overload.requestIds,
        title: `Track possession overlap on ${blockId}`,
        detail: `${overload.requestIds.join(" and ")} both occupy ${blockId} between ${formatSpan(overload.start, overload.end)} — ${minutes} minutes. ${blockId} allows ${capacity} job at a time.`,
        subjects: [blockId],
        observed: `${overload.peak} concurrent for ${minutes} min`,
        required: `${capacity} concurrent`,
        shortfallMinutes: minutes,
        window: { start: overload.start, end: overload.end },
        remedy: `Separate ${overload.requestIds.join(" and ")} by at least ${minutes} minutes on ${blockId}.`,
      });
    });
  });

  return found;
}

function checkConflictZones(jobs: Job[], world: PlanningWorld): Omit<Violation, "id">[] {
  const found: Omit<Violation, "id">[] = [];
  world.conflictZones.forEach((zone) => {
    const zoneBlocks = new Set(zone.blockIds);
    const inZone = jobs.filter(
      (job) =>
        job.request.blockIds.some((id) => zoneBlocks.has(id)) &&
        (zone.appliesToWorkClasses.length === 0 ||
          zone.appliesToWorkClasses.includes(job.request.workClass)),
    );
    findOverloads(inZone.map((job) => job.occupancy), 1).forEach((overload) => {
      const minutes = overload.end - overload.start;
      found.push({
        ruleId: "CONFLICT_ZONE",
        severity: "critical",
        requestIds: overload.requestIds,
        title: `${zone.name} held by two jobs`,
        detail: `${overload.requestIds.join(" and ")} both hold ${zone.name} between ${formatSpan(overload.start, overload.end)}. ${zone.reason}`,
        subjects: [zone.id, zone.name],
        observed: `${overload.peak} concurrent for ${minutes} min`,
        required: "1 concurrent",
        shortfallMinutes: minutes,
        window: { start: overload.start, end: overload.end },
        remedy: `Sequence ${overload.requestIds.join(" and ")} so only one holds ${zone.name} at a time.`,
      });
    });
  });
  return found;
}

function checkAdjacentWork(jobs: Job[], world: PlanningWorld): Omit<Violation, "id">[] {
  const found: Omit<Violation, "id">[] = [];
  for (let i = 0; i < jobs.length; i += 1) {
    for (let j = i + 1; j < jobs.length; j += 1) {
      const a = jobs[i];
      const b = jobs[j];
      const compatibility = world.areWorkClassesCompatible(a.request.workClass, b.request.workClass);
      if (compatibility.compatible || !compatibility.extendsToAdjacent) continue;

      const distance = world.blockDistance(a.request.blockIds, b.request.blockIds);
      // Distance 0 is a shared block, already reported by BLOCK_CAPACITY.
      if (distance !== 1) continue;

      const overlap = {
        start: Math.max(a.occupancy.start, b.occupancy.start),
        end: Math.min(a.occupancy.end, b.occupancy.end),
      };
      const minutes = Math.max(0, overlap.end - overlap.start);
      if (minutes <= 0) continue;

      const neighbours = world.blocksWithin(a.request.blockIds, 1).filter((id) =>
        b.request.blockIds.includes(id),
      );
      found.push({
        ruleId: "ADJACENT_WORK",
        severity: "critical",
        requestIds: [a.request.id, b.request.id].sort(),
        title: `${a.request.id} and ${b.request.id} run on neighbouring blocks`,
        detail: `${a.request.id} (${a.request.workType}) and ${b.request.id} (${b.request.workType}) overlap by ${minutes} minutes on blocks one step apart (${neighbours.join(", ")}). ${compatibility.reason}`,
        subjects: neighbours,
        observed: `${minutes} min concurrent, 1 block apart`,
        required: "no overlap within 1 block",
        shortfallMinutes: minutes,
        window: overlap,
        remedy: `Separate ${a.request.id} and ${b.request.id} by ${minutes} minutes, or move one to a different corridor.`,
      });
    }
  }
  return found;
}

function checkWorkCompatibility(jobs: Job[], world: PlanningWorld): Omit<Violation, "id">[] {
  const found: Omit<Violation, "id">[] = [];
  for (let i = 0; i < jobs.length; i += 1) {
    for (let j = i + 1; j < jobs.length; j += 1) {
      const a = jobs[i];
      const b = jobs[j];
      const shared = a.request.blockIds.filter((id) => b.request.blockIds.includes(id));
      if (!shared.length) continue;
      // Only meaningful where a block permits concurrent work at all; otherwise
      // BLOCK_CAPACITY is the binding rule and reporting both is noise.
      if (shared.every((id) => (world.blockById[id]?.capacity ?? 1) <= 1)) continue;

      const compatibility = world.areWorkClassesCompatible(a.request.workClass, b.request.workClass);
      if (compatibility.compatible) continue;

      const overlap = {
        start: Math.max(a.occupancy.start, b.occupancy.start),
        end: Math.min(a.occupancy.end, b.occupancy.end),
      };
      const minutes = Math.max(0, overlap.end - overlap.start);
      if (minutes <= 0) continue;

      found.push({
        ruleId: "WORK_COMPATIBILITY",
        severity: "critical",
        requestIds: [a.request.id, b.request.id].sort(),
        title: `Incompatible work on ${world.sectorLabel(shared)}`,
        detail: `${a.request.workType} and ${b.request.workType} share ${shared.join(", ")} for ${minutes} minutes. ${compatibility.reason}`,
        subjects: shared,
        observed: `${minutes} min concurrent`,
        required: "no overlap",
        shortfallMinutes: minutes,
        window: overlap,
        remedy: `Sequence ${a.request.id} and ${b.request.id} rather than running them together.`,
      });
    }
  }
  return found;
}

function checkTeams(jobs: Job[], context: ValidationContext, world: PlanningWorld): Omit<Violation, "id">[] {
  const found: Omit<Violation, "id">[] = [];
  const byTeam = new Map<string, Interval[]>();
  jobs.forEach((job) => {
    if (!byTeam.has(job.placement.teamId)) byTeam.set(job.placement.teamId, []);
    byTeam.get(job.placement.teamId)!.push(job.work);
  });

  byTeam.forEach((intervals, teamId) => {
    const team = world.teamById[teamId];
    if (!team) return;

    findOverloads(intervals, team.capacity).forEach((overload) => {
      const minutes = overload.end - overload.start;
      found.push({
        ruleId: "TEAM_CAPACITY",
        severity: "critical",
        requestIds: overload.requestIds,
        title: `${team.name} is committed to ${overload.peak} jobs at once`,
        detail: `${overload.requestIds.join(", ")} all require ${team.name} between ${formatSpan(overload.start, overload.end)}. ${team.capacity === 1 ? "Only one crew is rostered." : `Only ${team.capacity} crews are rostered.`}`,
        subjects: [team.name],
        observed: `${overload.peak} concurrent for ${minutes} min`,
        required: `${team.capacity} concurrent`,
        shortfallMinutes: minutes,
        window: { start: overload.start, end: overload.end },
        remedy: `Stagger ${overload.requestIds.join(" and ")}, or roster an additional ${team.name} crew.`,
      });
    });

    (context.unavailableTeams ?? [])
      .filter((entry) => entry.teamId === teamId)
      .forEach((entry) => {
        const affected = intervals.filter((i) => i.end > entry.fromMinute);
        if (!affected.length) return;
        found.push({
          ruleId: "SHIFT_AVAILABILITY",
          severity: "critical",
          requestIds: affected.map((i) => i.requestId).sort(),
          title: `${team.name} is unavailable from ${formatSpan(entry.fromMinute, entry.fromMinute).split("-")[0]}`,
          detail: `${affected.map((i) => i.requestId).join(", ")} still require ${team.name} after it becomes unavailable.`,
          subjects: [team.name],
          observed: `${affected.length} jobs after ${formatSpan(entry.fromMinute, entry.fromMinute).split("-")[0]}`,
          required: "0 jobs",
          shortfallMinutes: Math.max(...affected.map((i) => i.end - entry.fromMinute)),
          window: { start: entry.fromMinute, end: Math.max(...affected.map((i) => i.end)) },
          remedy: `Move ${affected.map((i) => i.requestId).join(" and ")} earlier or reassign the work.`,
        });
      });

    intervals.forEach((interval) => {
      if (interval.start >= team.shiftStart && interval.end <= team.shiftEnd) return;
      found.push({
        ruleId: "SHIFT_AVAILABILITY",
        severity: "critical",
        requestIds: [interval.requestId],
        title: `${interval.requestId} falls outside the ${team.name} shift`,
        detail: `${interval.requestId} runs ${formatSpan(interval.start, interval.end)}; the ${team.name} shift is ${formatSpan(team.shiftStart, team.shiftEnd)}.`,
        subjects: [team.name],
        observed: formatSpan(interval.start, interval.end),
        required: formatSpan(team.shiftStart, team.shiftEnd),
        shortfallMinutes: Math.max(team.shiftStart - interval.start, interval.end - team.shiftEnd),
        // Only the part of the job that falls outside the shift is at fault.
        window:
          interval.start < team.shiftStart
            ? { start: interval.start, end: Math.min(interval.end, team.shiftStart) }
            : { start: Math.max(interval.start, team.shiftEnd), end: interval.end },
        remedy: `Move ${interval.requestId} inside the shift or reassign it.`,
      });
    });
  });

  return found;
}

function checkEquipment(jobs: Job[], world: PlanningWorld): Omit<Violation, "id">[] {
  const found: Omit<Violation, "id">[] = [];
  const byEquipment = new Map<string, Interval[]>();

  jobs.forEach((job) => {
    job.request.equipment.forEach((demand) => {
      const type = world.equipmentById[demand.equipmentId];
      if (!type) return;
      if (!byEquipment.has(demand.equipmentId)) byEquipment.set(demand.equipmentId, []);
      // The asset is unavailable to anyone else until it has been moved and
      // re-rigged, so turnaround extends the committed interval.
      for (let unit = 0; unit < demand.units; unit += 1) {
        byEquipment.get(demand.equipmentId)!.push({
          requestId: job.request.id,
          start: job.work.start,
          end: job.work.end + type.turnaroundMinutes,
        });
      }
    });
  });

  byEquipment.forEach((intervals, equipmentId) => {
    const type = world.equipmentById[equipmentId];
    if (!type) return;
    findOverloads(intervals, type.units).forEach((overload) => {
      const minutes = overload.end - overload.start;
      found.push({
        ruleId: "EQUIPMENT_CAPACITY",
        severity: "critical",
        requestIds: overload.requestIds,
        title: `${type.name}: ${overload.peak} demands, ${type.units} available`,
        detail: `${overload.requestIds.join(" and ")} both need the ${type.name} between ${formatSpan(overload.start, overload.end)}${type.turnaroundMinutes ? ` (including ${type.turnaroundMinutes} minutes of turnaround)` : ""}. ${type.units === 1 ? "Only one unit is serviceable." : `Only ${type.units} units are serviceable.`}`,
        subjects: [type.name],
        observed: `${overload.peak} units needed for ${minutes} min`,
        required: `${type.units} units`,
        shortfallMinutes: minutes,
        window: { start: overload.start, end: overload.end },
        remedy: `Separate ${overload.requestIds.join(" and ")} by ${minutes} minutes, or source another ${type.name}.`,
      });
    });
  });

  return found;
}

function checkSkills(jobs: Job[], world: PlanningWorld): Omit<Violation, "id">[] {
  return jobs.flatMap(({ request, placement }) => {
    const team = world.teamById[placement.teamId];
    if (!team) {
      return [
        {
          ruleId: "SKILL_COVERAGE" as const,
          severity: "critical" as const,
          requestIds: [request.id],
          title: `${request.id} has no assigned team`,
          detail: `${request.id} references team ${placement.teamId}, which is not rostered.`,
          subjects: [placement.teamId],
          observed: "unknown team",
          required: "a rostered team",
          shortfallMinutes: 0,
          window: null,
          remedy: `Assign ${request.id} to a rostered team.`,
        },
      ];
    }
    const missing = request.requiredSkills.filter((skill) => !team.skills.includes(skill));
    if (!missing.length) return [];
    return [
      {
        ruleId: "SKILL_COVERAGE" as const,
        severity: "critical" as const,
        requestIds: [request.id],
        title: `${team.name} is not qualified for ${request.id}`,
        detail: `${request.id} requires ${missing.join(", ")}; ${team.name} holds ${team.skills.join(", ")}.`,
        subjects: [team.name, ...missing],
        observed: team.skills.join(", "),
        required: request.requiredSkills.join(", "),
        shortfallMinutes: 0,
        window: null,
        remedy: `Reassign ${request.id} to a team holding ${missing.join(" and ")}.`,
      },
    ];
  });
}

function checkDependencies(jobs: Job[], plan: Plan): Omit<Violation, "id">[] {
  const found: Omit<Violation, "id">[] = [];
  const byId = new Map(jobs.map((job) => [job.request.id, job]));
  const deferred = new Set(plan.deferred.map((entry) => entry.requestId));

  jobs.forEach((job) => {
    job.request.dependencies.forEach((predecessorId) => {
      const predecessor = byId.get(predecessorId);
      if (!predecessor) {
        if (!deferred.has(predecessorId)) return;
        found.push({
          ruleId: "DEPENDENCY_ORDER",
          severity: "critical",
          requestIds: [job.request.id, predecessorId].sort(),
          title: `${job.request.id} depends on deferred work`,
          detail: `${job.request.id} cannot proceed because its predecessor ${predecessorId} is not scheduled tonight.`,
          subjects: [predecessorId],
          observed: `${predecessorId} deferred`,
          required: `${predecessorId} placed before ${job.request.id}`,
          shortfallMinutes: 0,
          window: null,
          remedy: `Place ${predecessorId} or defer ${job.request.id} with it.`,
        });
        return;
      }

      const earliest =
        predecessor.work.end + predecessor.request.clearanceMinutes + job.request.dependencyLagMinutes;
      if (job.work.start >= earliest) return;

      found.push({
        ruleId: "DEPENDENCY_ORDER",
        severity: "critical",
        requestIds: [predecessorId, job.request.id],
        title: `${job.request.id} starts before ${predecessorId} is handed back`,
        detail: `${predecessorId} finishes at ${formatSpan(predecessor.work.end, predecessor.work.end).split("-")[0]} and requires ${predecessor.request.clearanceMinutes + job.request.dependencyLagMinutes} minutes before ${job.request.id} may start. The earliest valid start is ${formatSpan(earliest, earliest).split("-")[0]}, but ${job.request.id} is placed at ${formatSpan(job.work.start, job.work.start).split("-")[0]}.`,
        subjects: ["dependency"],
        observed: `starts ${formatSpan(job.work.start, job.work.start).split("-")[0]}`,
        required: `starts at or after ${formatSpan(earliest, earliest).split("-")[0]}`,
        shortfallMinutes: earliest - job.work.start,
        // The stretch the successor eats into: from where it starts to where it
        // was allowed to start.
        window: { start: job.work.start, end: earliest },
        remedy: `Move ${job.request.id} ${earliest - job.work.start} minutes later.`,
      });
    });
  });

  return found;
}

/**
 * Travel time between consecutive jobs for the same crew.
 *
 * Only applied where the team has a single crew, because with more than one
 * crew the plan does not say which crew takes which job, and asserting a
 * violation would be guessing.
 */
function checkTravel(jobs: Job[], world: PlanningWorld): Omit<Violation, "id">[] {
  const found: Omit<Violation, "id">[] = [];
  world.teams
    .filter((team) => team.capacity === 1)
    .forEach((team) => {
      const assigned = jobs
        .filter((job) => job.placement.teamId === team.id)
        .sort((a, b) => a.work.start - b.work.start);

      for (let index = 0; index < assigned.length - 1; index += 1) {
        const current = assigned[index];
        const next = assigned[index + 1];
        const travel = travelMinutes(current.request.blockIds, next.request.blockIds, world);
        const gap = next.work.start - current.work.end;
        // A negative gap means the two jobs overlap, which TEAM_CAPACITY already
        // reports; raising a travel finding on top of it is double-counting.
        if (travel === 0 || gap < 0 || gap >= travel) continue;

        found.push({
          ruleId: "TRAVEL_TIME",
          severity: "critical",
          requestIds: [current.request.id, next.request.id],
          title: `${team.name} cannot reach ${next.request.id} in time`,
          detail: `${team.name} finishes ${current.request.id} on ${world.sectorLabel(current.request.blockIds)} at ${formatSpan(current.work.end, current.work.end).split("-")[0]} and is due on ${world.sectorLabel(next.request.blockIds)} at ${formatSpan(next.work.start, next.work.start).split("-")[0]}. That move takes ${travel} minutes; only ${Math.max(0, gap)} are available.`,
          subjects: [team.name],
          observed: `${Math.max(0, gap)} min gap`,
          required: `${travel} min gap`,
          shortfallMinutes: travel - gap,
          // The stretch the crew would have to be in two places to cover.
          window: { start: current.work.end, end: current.work.end + travel },
          remedy: `Delay ${next.request.id} by ${travel - gap} minutes or assign it to another team.`,
        });
      }
    });
  return found;
}

/** Graph distance in minutes, falling back to a road transfer between lines. */
export function travelMinutes(from: string[], to: string[], world: PlanningWorld = literalWorld()): number {
  const distance = world.blockDistance(from, to);
  if (distance === 0) return 0;
  if (!Number.isFinite(distance)) return world.interLineTransferMinutes;
  return distance * world.minutesPerBlockHop;
}

// --- post-processing --------------------------------------------------------

/**
 * Collapse duplicates and assign stable ids.
 *
 * The same pair of jobs can breach one rule on several blocks. Reporting that
 * once, with every affected block listed, is what a planner needs; reporting it
 * four times is what makes a tool feel untrustworthy.
 */
function dedupe(raw: Omit<Violation, "id">[]): Violation[] {
  const merged = new Map<string, Omit<Violation, "id">>();

  raw.forEach((violation) => {
    const key = `${violation.ruleId}|${[...violation.requestIds].sort().join(",")}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...violation, requestIds: [...violation.requestIds].sort() });
      return;
    }
    existing.subjects = [...new Set([...existing.subjects, ...violation.subjects])];
    if (violation.shortfallMinutes > existing.shortfallMinutes) {
      existing.shortfallMinutes = violation.shortfallMinutes;
      existing.detail = violation.detail;
      existing.observed = violation.observed;
      existing.remedy = violation.remedy;
      existing.window = violation.window;
    }
  });

  return [...merged.values()]
    .sort(
      (a, b) =>
        b.shortfallMinutes - a.shortfallMinutes ||
        a.ruleId.localeCompare(b.ruleId) ||
        a.requestIds.join().localeCompare(b.requestIds.join()),
    )
    .map((violation, index) => ({
      ...violation,
      id: `V${String(index + 1).padStart(2, "0")}-${violation.ruleId}`,
    }));
}

/**
 * Group violations into clusters of mutually-entangled requests.
 *
 * Twenty findings across six independent clusters is a very different morning
 * from twenty findings that are all one knot, so the queue shows clusters.
 */
export function clusterViolations(violations: Violation[]): { id: string; requestIds: string[]; violations: Violation[] }[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const value = parent.get(id) ?? id;
    if (value === id) return id;
    const root = find(value);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };

  violations.forEach((violation) => {
    violation.requestIds.forEach((id) => {
      if (!parent.has(id)) parent.set(id, id);
    });
    violation.requestIds.slice(1).forEach((id) => union(violation.requestIds[0], id));
  });

  const groups = new Map<string, Violation[]>();
  violations.forEach((violation) => {
    const root = find(violation.requestIds[0]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(violation);
  });

  return [...groups.entries()]
    .map(([root, items]) => ({
      id: `C-${root}`,
      requestIds: [...new Set(items.flatMap((item) => item.requestIds))].sort(),
      violations: items,
    }))
    .sort((a, b) => b.violations.length - a.violations.length || a.id.localeCompare(b.id));
}
