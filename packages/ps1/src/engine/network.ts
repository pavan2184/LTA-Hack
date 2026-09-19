import type {
  Bound,
  LocationSupply,
  NatureOfWorks,
  Ps1Instance,
  Sector,
} from "../types/ps1";

export class NetworkError extends Error {}

export type ParsedLocation =
  | {
      kind: "SEC";
      lineCode: string;
      bound: Bound;
      fromStationId: string;
      toStationId: string;
    }
  | { kind: "PLAT"; lineCode: string; bound: Bound; stationId: string };

/**
 * Split a location id into its parts.
 *
 * `SEC:ALP:S02_S03:EB` is a tunnel sector, `PLAT:ALP:S03:EB` a platform. The
 * station pair inside a sector id is separated by an underscore, and station
 * ids themselves never contain one, so a single split is unambiguous.
 */
export function parseLocationId(locationId: string): ParsedLocation {
  const parts = locationId.split(":");
  if (parts.length !== 4) {
    throw new NetworkError(`Malformed location id: ${locationId}`);
  }
  const [kind, lineCode, middle, boundRaw] = parts;
  if (boundRaw !== "EB" && boundRaw !== "WB") {
    throw new NetworkError(`Malformed location id: ${locationId}`);
  }
  if (kind === "PLAT") {
    return { kind, lineCode, bound: boundRaw, stationId: middle };
  }
  if (kind === "SEC") {
    const stations = middle.split("_");
    if (stations.length !== 2) {
      throw new NetworkError(`Malformed location id: ${locationId}`);
    }
    return {
      kind,
      lineCode,
      bound: boundRaw,
      fromStationId: stations[0],
      toStationId: stations[1],
    };
  }
  throw new NetworkError(`Malformed location id: ${locationId}`);
}

export interface Network {
  /** Sectors of one line in running order, keyed by line code. */
  sectorsByLine: Map<string, Sector[]>;
  /** Index of a sector within its line's ordered list, keyed by bare sector id. */
  sectorIndex: Map<string, number>;
  /** Every bookable location the instance declares, keyed by full id. */
  supply: Map<string, LocationSupply>;
  bufferByNature: Map<NatureOfWorks, { sectors: number; mirror: boolean }>;
  /** Station ids that appear on more than one line. */
  interchangeStations: Set<string>;
  lineCodes: string[];
}

export function buildNetwork(instance: Ps1Instance): Network {
  const sectorsByLine = new Map<string, Sector[]>();
  for (const sector of instance.sectors) {
    const list = sectorsByLine.get(sector.lineCode) ?? [];
    list.push(sector);
    sectorsByLine.set(sector.lineCode, list);
  }
  const sectorIndex = new Map<string, number>();
  for (const [, list] of sectorsByLine) {
    list.sort((a, b) => a.seq - b.seq);
    list.forEach((sector, index) => sectorIndex.set(sector.sectorId, index));
  }

  const byStation = new Map<string, Set<string>>();
  for (const station of instance.stations) {
    const lines = byStation.get(station.stationId) ?? new Set<string>();
    lines.add(station.lineCode);
    byStation.set(station.stationId, lines);
  }

  return {
    sectorsByLine,
    sectorIndex,
    supply: new Map(instance.locationSupply.map((row) => [row.locationId, row])),
    bufferByNature: new Map(
      instance.bufferRules.map((rule) => [
        rule.natureOfWorks,
        { sectors: rule.upToBufferSectors, mirror: rule.oppositeBoundRequired },
      ]),
    ),
    interchangeStations: new Set(
      [...byStation].filter(([, lines]) => lines.size > 1).map(([id]) => id),
    ),
    lineCodes: [...sectorsByLine.keys()],
  };
}

const other = (bound: Bound): Bound => (bound === "EB" ? "WB" : "EB");

/** The bare sector id (no bound) for a sector location. */
function bareSectorId(location: Extract<ParsedLocation, { kind: "SEC" }>): string {
  return `SEC:${location.lineCode}:${location.fromStationId}_${location.toStationId}`;
}

/**
 * Every location an activity occupies between two sector endpoints.
 *
 * A job running from one station to another books every tunnel sector it passes
 * through and every platform it passes, from book-in to book-out. Endpoint order
 * does not matter: the span is the inclusive range between the two indices.
 */
export function expandSpan(
  network: Network,
  startLocationId: string,
  endLocationId: string,
): string[] {
  const start = parseLocationId(startLocationId);
  const end = parseLocationId(endLocationId);
  if (start.kind !== "SEC" || end.kind !== "SEC") {
    throw new NetworkError(
      `Activity spans must run between tunnel sectors: ${startLocationId} -> ${endLocationId}`,
    );
  }
  if (start.lineCode !== end.lineCode || start.bound !== end.bound) {
    throw new NetworkError(
      `Activity spans must stay on one line and bound: ${startLocationId} -> ${endLocationId}`,
    );
  }

  const list = network.sectorsByLine.get(start.lineCode);
  if (!list) throw new NetworkError(`Unknown line: ${start.lineCode}`);
  const from = network.sectorIndex.get(bareSectorId(start));
  const to = network.sectorIndex.get(bareSectorId(end));
  if (from === undefined || to === undefined) {
    throw new NetworkError(`Unknown sector in span ${startLocationId} -> ${endLocationId}`);
  }

  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const bound = start.bound;
  const locations = new Set<string>();
  const stations = new Set<string>();
  for (let i = lo; i <= hi; i += 1) {
    const sector = list[i];
    locations.add(`${sector.sectorId}:${bound}`);
    stations.add(sector.fromStationId);
    stations.add(sector.toStationId);
  }
  for (const stationId of stations) {
    locations.add(`PLAT:${start.lineCode}:${stationId}:${bound}`);
  }
  return [...locations].sort();
}

/**
 * The full set of locations a possession closes, occupancy plus buffer.
 *
 * Only `Live` and `Non-live (Consist)` carry a buffer. `Live` additionally
 * mirrors onto the opposite bound, and — only at an interchange, and only for
 * `Live` — crosses onto the other line's `H01_H02` tunnel and its platforms,
 * because cutting traction power there affects both tunnels.
 *
 * Locations that fall outside the declared supply are dropped rather than
 * returned: a buffer reaching past the end of a line closes nothing.
 */
export function closureFor(
  network: Network,
  occupied: string[],
  nature: NatureOfWorks,
): string[] {
  const initial = expandClosureSeeds(network, occupied, nature);
  if (!network.bufferByNature.get(nature)?.mirror) return initial;

  // A Live interchange closure carries its buffer onto the other line too.
  // Seed that line's crossed tunnel, then expand from the original worksite.
  // Expanding the already buffered set would incorrectly grow the first line's
  // exclusion radius a second time.
  const sourceLines = new Set(occupied.map((id) => parseLocationId(id).lineCode));
  const crossedTunnels = initial.filter((id) => {
    const location = parseLocationId(id);
    return location.kind === "SEC" && !sourceLines.has(location.lineCode);
  });
  return crossedTunnels.length
    ? expandClosureSeeds(network, [...occupied, ...crossedTunnels], nature)
    : initial;
}

function expandClosureSeeds(
  network: Network,
  occupied: string[],
  nature: NatureOfWorks,
): string[] {
  const rule = network.bufferByNature.get(nature) ?? { sectors: 0, mirror: false };
  const closure = new Set<string>(occupied);

  // Buffer outward along each line/bound the occupancy touches.
  if (rule.sectors > 0) {
    for (const locationId of occupied) {
      const parsed = parseLocationId(locationId);
      if (parsed.kind !== "SEC") continue;
      const list = network.sectorsByLine.get(parsed.lineCode);
      const index = network.sectorIndex.get(bareSectorId(parsed));
      if (!list || index === undefined) continue;
      for (let step = 1; step <= rule.sectors; step += 1) {
        for (const i of [index - step, index + step]) {
          if (i < 0 || i >= list.length) continue;
          const sector = list[i];
          // A line's sectors are contiguous in `seq`, but two lines share one
          // ordered list only if they were merged; guard on line code so a
          // buffer never walks off Alpha's end onto Beta's start.
          if (sector.lineCode !== parsed.lineCode) continue;
          closure.add(`${sector.sectorId}:${parsed.bound}`);
          // Consist exclusion extends tunnel sectors; its platforms remain the
          // occupied ones. Live power isolation also closes buffer platforms.
          // This distinction is observable in the A025/A028 rejection details.
          if (nature === "Live") {
            closure.add(`PLAT:${sector.lineCode}:${sector.fromStationId}:${parsed.bound}`);
            closure.add(`PLAT:${sector.lineCode}:${sector.toStationId}:${parsed.bound}`);
          }
        }
      }
    }
  }

  // Live mirrors every closed location onto the opposite bound.
  if (rule.mirror) {
    for (const locationId of [...closure]) {
      const parsed = parseLocationId(locationId);
      const mirrored =
        parsed.kind === "SEC"
          ? `${bareSectorId(parsed)}:${other(parsed.bound)}`
          : `PLAT:${parsed.lineCode}:${parsed.stationId}:${other(parsed.bound)}`;
      closure.add(mirrored);
    }

    // And crosses onto the other line at an interchange, both bounds.
    for (const locationId of [...closure]) {
      const parsed = parseLocationId(locationId);
      const touchesInterchange =
        parsed.kind === "SEC"
          ? network.interchangeStations.has(parsed.fromStationId) &&
            network.interchangeStations.has(parsed.toStationId)
          : network.interchangeStations.has(parsed.stationId);
      if (!touchesInterchange) continue;
      for (const lineCode of network.lineCodes) {
        if (lineCode === parsed.lineCode) continue;
        for (const bound of ["EB", "WB"] as Bound[]) {
          closure.add(
            parsed.kind === "SEC"
              ? `SEC:${lineCode}:${parsed.fromStationId}_${parsed.toStationId}:${bound}`
              : `PLAT:${lineCode}:${parsed.stationId}:${bound}`,
          );
        }
      }
    }
  }

  // Anything the instance does not declare as supply is not a real location.
  return [...closure].filter((id) => network.supply.has(id)).sort();
}
