/**
 * Rail network topology.
 *
 * A sector label like "NS10-NS12" is a display convenience. Planning happens on
 * atomic track blocks, because two requests can share physical track without
 * sharing a label: NS10-NS12 and NS11-NS13 both occupy NS11-NS12.
 *
 * Fabricated topology for a hackathon prototype. Station codes follow the
 * Singapore MRT naming convention but the block model, lengths, conflict zones
 * and capacities are invented and carry no operational authority.
 */

export interface Station {
  code: string;
  name: string;
  line: LineId;
  index: number;
}

export type LineId = "NS" | "EW" | "CC";

export interface TrackBlock {
  /** Stable identifier used by the solver, validator, timeline and map alike. */
  id: string;
  line: LineId;
  from: string;
  to: string;
  lengthMetres: number;
  /** How many jobs may occupy this block at once. 1 = exclusive possession. */
  capacity: number;
}

/**
 * An area whose blocks cannot be worked simultaneously by incompatible work,
 * even though the blocks themselves are distinct. Junctions, crossovers and
 * traction-power isolation areas behave this way.
 */
export interface ConflictZone {
  id: string;
  name: string;
  blockIds: string[];
  /** Only work of these classes is constrained by the zone. Empty = all work. */
  appliesToWorkClasses: string[];
  reason: string;
}

export const lines: Record<LineId, { id: LineId; name: string; colour: string }> = {
  NS: { id: "NS", name: "North-South", colour: "#c0392b" },
  EW: { id: "EW", name: "East-West", colour: "#1e7a4b" },
  CC: { id: "CC", name: "Circle", colour: "#b07d1a" },
};

const stationSeed: [LineId, string, string][] = [
  ["NS", "NS10", "Admiralty"],
  ["NS", "NS11", "Sembawang"],
  ["NS", "NS12", "Canberra"],
  ["NS", "NS13", "Yishun"],
  ["NS", "NS14", "Khatib"],
  ["NS", "NS15", "Yio Chu Kang"],
  ["NS", "NS16", "Ang Mo Kio"],
  ["EW", "EW18", "Redhill"],
  ["EW", "EW19", "Queenstown"],
  ["EW", "EW20", "Commonwealth"],
  ["EW", "EW21", "Buona Vista"],
  ["EW", "EW22", "Dover"],
  ["CC", "CC10", "MacPherson"],
  ["CC", "CC11", "Tai Seng"],
  ["CC", "CC12", "Bartley"],
];

export const stations: Station[] = stationSeed.map(([line, code, name], index) => ({
  code,
  name,
  line,
  index,
}));

export const stationByCode: Record<string, Station> = Object.fromEntries(
  stations.map((station) => [station.code, station]),
);

/** Ordered station codes per line, used to expand a range into atomic blocks. */
export const lineOrder: Record<LineId, string[]> = {
  NS: stations.filter((s) => s.line === "NS").map((s) => s.code),
  EW: stations.filter((s) => s.line === "EW").map((s) => s.code),
  CC: stations.filter((s) => s.line === "CC").map((s) => s.code),
};

function buildBlocks(): TrackBlock[] {
  const result: TrackBlock[] = [];
  (Object.keys(lineOrder) as LineId[]).forEach((line) => {
    const codes = lineOrder[line];
    codes.slice(0, -1).forEach((from, index) => {
      const to = codes[index + 1];
      result.push({
        id: `${from}-${to}`,
        line,
        from,
        to,
        // Deterministic pseudo-length: enough to make travel times differ.
        lengthMetres: 900 + ((index * 7 + line.charCodeAt(0)) % 6) * 150,
        capacity: 1,
      });
    });
  });
  return result;
}

export const trackBlocks: TrackBlock[] = buildBlocks();

export const blockById: Record<string, TrackBlock> = Object.fromEntries(
  trackBlocks.map((block) => [block.id, block]),
);

export const blockIds: string[] = trackBlocks.map((block) => block.id);

/**
 * Expand a sector label ("NS10-NS12") into the atomic blocks it occupies.
 * Accepts an en dash or a hyphen. Throws on an unknown or cross-line range so a
 * typo in the dataset fails loudly at import rather than silently planning
 * against nothing.
 */
export function expandSector(sector: string): string[] {
  const [rawFrom, rawTo] = sector.split(/[–-]/).map((part) => part.trim());
  const from = stationByCode[rawFrom];
  const to = stationByCode[rawTo];
  if (!from || !to) throw new Error(`Unknown station in sector "${sector}"`);
  if (from.line !== to.line) throw new Error(`Sector "${sector}" crosses lines`);

  const codes = lineOrder[from.line];
  const start = Math.min(codes.indexOf(from.code), codes.indexOf(to.code));
  const end = Math.max(codes.indexOf(from.code), codes.indexOf(to.code));
  if (start === end) throw new Error(`Sector "${sector}" has zero length`);

  return codes.slice(start, end).map((code, offset) => `${code}-${codes[start + offset + 1]}`);
}

/** Display label for a set of blocks, e.g. ["NS10-NS11","NS11-NS12"] -> "NS10-NS12". */
export function sectorLabel(ids: string[]): string {
  if (!ids.length) return "-";
  const blocks = ids.map((id) => blockById[id]).filter(Boolean);
  if (!blocks.length) return "-";
  const line = blocks[0].line;
  const codes = lineOrder[line];
  const indices = blocks.flatMap((b) => [codes.indexOf(b.from), codes.indexOf(b.to)]);
  return `${codes[Math.min(...indices)]}-${codes[Math.max(...indices)]}`;
}

/**
 * Undirected adjacency between blocks: two blocks are adjacent when they share
 * a station. Used for the adjacent-work exclusion rule, where certain work
 * cannot run beside a live isolation.
 */
function buildAdjacency(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  trackBlocks.forEach((a) => {
    map[a.id] = trackBlocks
      .filter((b) => b.id !== a.id && (b.from === a.to || b.to === a.from || b.from === a.from || b.to === a.to))
      .map((b) => b.id);
  });
  return map;
}

export const blockAdjacency: Record<string, string[]> = buildAdjacency();

/** Blocks within `hops` graph steps of any block in `ids`, excluding `ids`. */
export function blocksWithin(ids: string[], hops: number): string[] {
  const seen = new Set(ids);
  let frontier = ids;
  for (let step = 0; step < hops; step += 1) {
    const next: string[] = [];
    frontier.forEach((id) => {
      (blockAdjacency[id] ?? []).forEach((neighbour) => {
        if (!seen.has(neighbour)) {
          seen.add(neighbour);
          next.push(neighbour);
        }
      });
    });
    frontier = next;
  }
  return [...seen].filter((id) => !ids.includes(id));
}

/** Shortest hop distance between two block sets. 0 when they intersect. */
export function blockDistance(a: string[], b: string[]): number {
  const target = new Set(b);
  if (a.some((id) => target.has(id))) return 0;
  const seen = new Set(a);
  let frontier = a;
  let distance = 0;
  while (frontier.length && distance < trackBlocks.length) {
    distance += 1;
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of blockAdjacency[id] ?? []) {
        if (seen.has(neighbour)) continue;
        if (target.has(neighbour)) return distance;
        seen.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Traction power on this fabricated network is fed from two substations. Work
 * that isolates traction current affects every block the substation feeds, not
 * just the block being worked on — which is why an EW job can block an NS job.
 */
export const conflictZones: ConflictZone[] = [
  {
    id: "Z-SS4",
    name: "Substation SS-4 isolation area",
    blockIds: ["NS12-NS13", "NS13-NS14", "NS14-NS15", "EW18-EW19", "EW19-EW20"],
    appliesToWorkClasses: ["traction-power"],
    reason:
      "SS-4 feeds both the northern NS section and the western EW section. Only one traction isolation may be live at a time.",
  },
  {
    id: "Z-JN-CC11",
    name: "CC11 crossover",
    blockIds: ["CC10-CC11", "CC11-CC12"],
    appliesToWorkClasses: ["track-possession", "signalling"],
    reason:
      "The crossover at CC11 cannot be occupied from both directions at once during signalling or possession work.",
  },
];

export const conflictZoneById: Record<string, ConflictZone> = Object.fromEntries(
  conflictZones.map((zone) => [zone.id, zone]),
);
