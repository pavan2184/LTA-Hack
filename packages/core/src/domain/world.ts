import { buildInstanceFromLiterals, type PlanningInstance } from "./instance";
import type { ConflictZone, LineId, Station, TrackBlock } from "./network";
import type { EquipmentType, Team, WorkClass } from "./resources";
import type { MaintenanceRequest } from "../types/railplan";

/**
 * A `PlanningInstance` with its lookups and topology queries derived.
 *
 * The instance is the contract — flat, serialisable, safe to send over a wire
 * or store in a table. The world is what the rules actually need: indexed by
 * id, with the graph walks precomputed. Keeping them apart means the thing that
 * crosses a boundary stays plain data, and the thing with functions on it is
 * always derived rather than transmitted.
 *
 * Everything here is a pure function of the instance. Two worlds built from
 * instances with the same digest behave identically, which is what lets a plan
 * be validated against the database's version of the night rather than against
 * whichever literals happen to be compiled into the process.
 */
export interface PlanningWorld {
  instance: PlanningInstance;

  windowStart: number;
  windowEnd: number;
  slotMinutes: number;
  minutesPerBlockHop: number;
  interLineTransferMinutes: number;

  requests: MaintenanceRequest[];
  requestById: Record<string, MaintenanceRequest>;
  blocks: TrackBlock[];
  blockById: Record<string, TrackBlock>;
  teams: Team[];
  teamById: Record<string, Team>;
  equipment: EquipmentType[];
  equipmentById: Record<string, EquipmentType>;
  conflictZones: ConflictZone[];

  /** Undirected, as an adjacency list. */
  adjacency: Record<string, string[]>;

  /** Blocks within `hops` graph steps of any block in `ids`, excluding `ids`. */
  blocksWithin(ids: string[], hops: number): string[];
  /** Shortest hop distance between two block sets. 0 when they intersect. */
  blockDistance(a: string[], b: string[]): number;
  /** Whether two work classes may run concurrently, and how far the bar reaches. */
  areWorkClassesCompatible(
    a: WorkClass,
    b: WorkClass,
  ): { compatible: boolean; reason?: string; extendsToAdjacent: boolean };
  /** Display label for a block set, e.g. ["NS10-NS11","NS11-NS12"] -> "NS10-NS12". */
  sectorLabel(ids: string[]): string;
}

export function buildWorld(instance: PlanningInstance): PlanningWorld {
  const index = <T>(items: T[], key: (item: T) => string): Record<string, T> =>
    Object.fromEntries(items.map((item) => [key(item), item]));

  const adjacency: Record<string, string[]> = {};
  instance.blocks.forEach((block) => {
    adjacency[block.id] = [];
  });
  instance.adjacency.forEach((edge) => {
    (adjacency[edge.blockId] ??= []).push(edge.neighbourId);
  });
  Object.values(adjacency).forEach((neighbours) => neighbours.sort());

  // Station codes in running order per line, which is what turns a pair of
  // block ids back into a human-readable sector.
  const lineOrder = {} as Record<LineId, string[]>;
  const byLine = new Map<LineId, Station[]>();
  instance.stations.forEach((station) => {
    const list = byLine.get(station.line);
    if (list) list.push(station);
    else byLine.set(station.line, [station]);
  });
  byLine.forEach((list, line) => {
    lineOrder[line] = [...list].sort((a, b) => a.index - b.index).map((s) => s.code);
  });

  const blockById = index(instance.blocks, (block) => block.id);

  const blocksWithin = (ids: string[], hops: number): string[] => {
    const seen = new Set(ids);
    let frontier = ids;
    for (let step = 0; step < hops; step += 1) {
      const next: string[] = [];
      frontier.forEach((id) => {
        (adjacency[id] ?? []).forEach((neighbour) => {
          if (!seen.has(neighbour)) {
            seen.add(neighbour);
            next.push(neighbour);
          }
        });
      });
      frontier = next;
    }
    return [...seen].filter((id) => !ids.includes(id));
  };

  const blockDistance = (a: string[], b: string[]): number => {
    const target = new Set(b);
    if (a.some((id) => target.has(id))) return 0;
    const seen = new Set(a);
    let frontier = a;
    let distance = 0;
    while (frontier.length && distance < instance.blocks.length) {
      distance += 1;
      const next: string[] = [];
      for (const id of frontier) {
        for (const neighbour of adjacency[id] ?? []) {
          if (seen.has(neighbour)) continue;
          if (target.has(neighbour)) return distance;
          seen.add(neighbour);
          next.push(neighbour);
        }
      }
      frontier = next;
    }
    return Number.POSITIVE_INFINITY;
  };

  // Pairs are unordered, so both orders are looked up.
  const incompatibility = new Map<string, (typeof instance.workClassIncompatibilities)[number]>();
  instance.workClassIncompatibilities.forEach((pair) => {
    incompatibility.set(`${pair.a}|${pair.b}`, pair);
    incompatibility.set(`${pair.b}|${pair.a}`, pair);
  });

  return {
    instance,
    windowStart: instance.window.startMinute,
    windowEnd: instance.window.endMinute,
    slotMinutes: instance.window.slotMinutes,
    minutesPerBlockHop: instance.travel.minutesPerBlockHop,
    interLineTransferMinutes: instance.travel.interLineTransferMinutes,

    requests: instance.requests,
    requestById: index(instance.requests, (request) => request.id),
    blocks: instance.blocks,
    blockById,
    teams: instance.teams,
    teamById: index(instance.teams, (team) => team.id),
    equipment: instance.equipment,
    equipmentById: index(instance.equipment, (item) => item.id),
    conflictZones: instance.conflictZones,

    adjacency,
    blocksWithin,
    blockDistance,

    areWorkClassesCompatible(a, b) {
      const match = incompatibility.get(`${a}|${b}`);
      return match
        ? { compatible: false, reason: match.reason, extendsToAdjacent: match.extendsToAdjacent }
        : { compatible: true, extendsToAdjacent: false };
    },

    sectorLabel(ids) {
      if (!ids.length) return "-";
      const blocks = ids.map((id) => blockById[id]).filter(Boolean);
      if (!blocks.length) return "-";
      const codes = lineOrder[blocks[0].line] ?? [];
      const indices = blocks.flatMap((block) => [
        codes.indexOf(block.from),
        codes.indexOf(block.to),
      ]);
      return `${codes[Math.min(...indices)]}-${codes[Math.max(...indices)]}`;
    },
  };
}

/**
 * The world this package's literals describe.
 *
 * Built once, on first use rather than at import, so pulling in a type from
 * this module does not drag the whole dataset in behind it. This is the default
 * every engine entry point falls back to, which is what keeps the existing
 * callers — the dashboard, the tests — working unchanged while a caller that
 * has loaded a night out of Postgres can pass its own world instead.
 */
let literal: PlanningWorld | null = null;

export function literalWorld(): PlanningWorld {
  literal ??= buildWorld(buildInstanceFromLiterals());
  return literal;
}
