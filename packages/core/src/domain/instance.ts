import {
  workforceRoles,
  workforceAvailability,
  workforceDemand,
} from "../data/workforce";
import type {
  WorkforceRole,
  WorkforceAvailability,
  WorkforceDemand,
} from "../types/workforce";
import {
  PLANNING_NIGHT,
  requests,
  SLOT_MINUTES,
  WINDOW_END,
  WINDOW_START,
} from "../data/requests";
import { digest, stableStringify } from "../engine/hash";
import type { MaintenanceRequest } from "../types/railplan";
import {
  blockAdjacency,
  conflictZones,
  stations,
  trackBlocks,
  type ConflictZone,
  type Station,
  type TrackBlock,
} from "./network";
import {
  equipmentTypes,
  incompatiblePairs,
  INTER_LINE_TRANSFER_MINUTES,
  MINUTES_PER_BLOCK_HOP,
  teams,
  type EquipmentType,
  type Team,
  type WorkClassIncompatibility,
} from "./resources";

/**
 * Everything needed to plan one night, in one serialisable value.
 *
 * This is the contract, and it exists because the planning facts are about to
 * have more than one home. Today they are TypeScript literals in this package.
 * Next they are rows in Postgres. After that a Python CP-SAT service reads them
 * too. Three readers of the same facts is exactly the situation where they
 * quietly stop being the same facts — so there is one type, one canonical
 * ordering, and one digest that says whether two sources agree.
 *
 * Everything here is data. No functions, no derived lookups, nothing that
 * cannot survive a round trip through JSON or a database row.
 */
export interface PlanningInstance {
  /** Calendar date of the night being planned. */
  planningNight: string;
  window: {
    startMinute: number;
    endMinute: number;
    /** Planning resolution. Every candidate start is a multiple of this. */
    slotMinutes: number;
  };
  stations: Station[];
  blocks: TrackBlock[];
  /**
   * Undirected adjacency, stored rather than derived.
   *
   * It is derivable from the blocks — two blocks are adjacent when they share a
   * station — but storing it means the Python solver does not have to
   * reimplement that derivation to model the adjacent-work rule, and a test can
   * assert the stored edges match the derived ones. A rule reimplemented in a
   * second language is the drift this whole design is trying to avoid.
   */
  adjacency: { blockId: string; neighbourId: string }[];
  conflictZones: ConflictZone[];
  teams: Team[];
  workforceRoles: WorkforceRole[];
  workforceAvailability: WorkforceAvailability[];
  workforceDemand: WorkforceDemand[];
  equipment: EquipmentType[];
  workClassIncompatibilities: WorkClassIncompatibility[];
  requests: MaintenanceRequest[];
  travel: {
    minutesPerBlockHop: number;
    interLineTransferMinutes: number;
  };
}

/** The instance as this package's literals describe it. The seed source. */
export function buildInstanceFromLiterals(): PlanningInstance {
  return canonicalise({
    planningNight: PLANNING_NIGHT,
    window: {
      startMinute: WINDOW_START,
      endMinute: WINDOW_END,
      slotMinutes: SLOT_MINUTES,
    },
    stations,
    blocks: trackBlocks,
    adjacency: Object.entries(blockAdjacency).flatMap(([blockId, neighbours]) =>
      neighbours.map((neighbourId) => ({ blockId, neighbourId })),
    ),
    conflictZones,
    teams,
    workforceRoles,
    workforceAvailability,
    workforceDemand,
    equipment: equipmentTypes,
    workClassIncompatibilities: incompatiblePairs,
    requests,
    travel: {
      minutesPerBlockHop: MINUTES_PER_BLOCK_HOP,
      interLineTransferMinutes: INTER_LINE_TRANSFER_MINUTES,
    },
  });
}

/**
 * Put an instance into a fixed order.
 *
 * A database returns rows in whatever order it likes, and the literals are
 * written in whatever order reads well. Neither is wrong, and comparing them
 * unsorted would report a difference that is not one. Sorting first is what
 * makes `instanceDigest` a statement about content rather than about layout.
 */
export function canonicalise(instance: PlanningInstance): PlanningInstance {
  const byId = <T extends { id: string }>(items: T[]): T[] =>
    [...items].sort((a, b) => a.id.localeCompare(b.id));

  return {
    ...instance,
    stations: [...instance.stations].sort((a, b) =>
      a.code.localeCompare(b.code),
    ),
    blocks: byId(instance.blocks),
    adjacency: [...instance.adjacency].sort(
      (a, b) =>
        a.blockId.localeCompare(b.blockId) ||
        a.neighbourId.localeCompare(b.neighbourId),
    ),
    conflictZones: byId(instance.conflictZones).map((zone) => ({
      ...zone,
      blockIds: [...zone.blockIds].sort(),
      appliesToWorkClasses: [...zone.appliesToWorkClasses].sort(),
    })),
    teams: byId(instance.teams).map((team) => ({
      ...team,
      skills: [...team.skills].sort(),
    })),
    workforceRoles: byId(instance.workforceRoles),
    workforceAvailability: [...instance.workforceAvailability].sort(
      (a, b) =>
        a.planningNight.localeCompare(b.planningNight) ||
        a.teamId.localeCompare(b.teamId) ||
        a.roleId.localeCompare(b.roleId) ||
        a.startMinute - b.startMinute ||
        a.endMinute - b.endMinute,
    ),
    workforceDemand: [...instance.workforceDemand].sort(
      (a, b) =>
        a.requestId.localeCompare(b.requestId) ||
        a.roleId.localeCompare(b.roleId),
    ),
    equipment: byId(instance.equipment),
    // Each pair is unordered, so the two classes are sorted within the pair as
    // well as between pairs. Otherwise the same rule written the other way round
    // reads as a different rule.
    workClassIncompatibilities: instance.workClassIncompatibilities
      .map((pair) =>
        pair.a <= pair.b ? { ...pair } : { ...pair, a: pair.b, b: pair.a },
      )
      .sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b)),
    requests: byId(instance.requests).map((request) => ({
      ...request,
      // Block order is meaningful — it runs along the line — so it is left
      // alone. Skills, equipment and dependencies are sets written as arrays.
      requiredSkills: [...request.requiredSkills].sort(),
      equipment: [...request.equipment].sort((a, b) =>
        a.equipmentId.localeCompare(b.equipmentId),
      ),
      dependencies: [...request.dependencies].sort(),
    })),
  };
}

/**
 * Content digest of a canonicalised instance.
 *
 * Two sources of the planning facts agree when their digests match. That is the
 * check that keeps the seeded database honest against the literals it came
 * from, and later keeps the solver service honest about what it modelled.
 */
export function instanceDigest(instance: PlanningInstance): string {
  return digest(canonicalise(instance));
}

/** Verify content and identify changed sections without exposing their values. */
export function assertInstancesMatch(
  expected: PlanningInstance,
  actual: PlanningInstance,
): void {
  const left = canonicalise(expected);
  const right = canonicalise(actual);
  const sections = (Object.keys(left) as (keyof PlanningInstance)[]).filter(
    (key) => stableStringify(left[key]) !== stableStringify(right[key]),
  );
  if (sections.length)
    throw new Error(
      `Planning instance mismatch. Sections that differ: ${sections.join(", ")}`,
    );
  if (instanceDigest(left) !== instanceDigest(right))
    throw new Error(
      "Planning instance digest mismatch; check canonicalisation.",
    );
}
