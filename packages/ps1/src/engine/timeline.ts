import type { Ps1Instance, Submission } from "../types/ps1";
import { buildNetwork, parseLocationId, type Network } from "./network";
import { capacityAt, type Disruption } from "./disruption";

/**
 * The schedule as a grid a works controller can read: locations down, weeks
 * across.
 *
 * RailPlan's timeline is blocks against minutes of one night. PS1's equivalent
 * is locations against weeks of a thirty-week horizon, and the cell is a
 * possession count against that location's capacity rather than a bar. The
 * point is the same in both: congestion is a shape, and a table of rows hides
 * it.
 */

export interface TimelineCell {
  week: number;
  /** Distinct possessions opened here, which is what capacity limits. */
  possessions: number;
  /** Capacity from LOCATION_SUPPLY before temporary cuts. */
  nominalCapacity: number;
  /** Capacity after applying the tightest disruption for this location-week. */
  effectiveCapacity: number;
  /** Backwards-compatible display capacity: always the effective value. */
  capacity: number;
  disrupted: boolean;
  /** Activities present, in id order. */
  activityIds: string[];
  /** possessions / capacity, above 1 when the location is over supply. */
  load: number;
}

export interface TimelineRow {
  locationId: string;
  lineCode: string;
  bound: string;
  kind: "SEC" | "PLAT";
  /** Position along the line, for ordering rows the way the network runs. */
  seq: number;
  label: string;
  capacity: number;
  cells: Map<number, TimelineCell>;
  /** Weeks at or above capacity, the row's own hotspots. */
  peak: number;
}

export interface Timeline {
  weeks: number[];
  rows: TimelineRow[];
  /** Rows that hold nothing, kept separate so the default view is not mostly empty. */
  emptyRows: TimelineRow[];
  maxLoad: number;
}

export function buildTimeline(
  instance: Ps1Instance,
  submission: Submission,
  network: Network = buildNetwork(instance),
  disruptions: Disruption[] = [],
): Timeline {
  const weeks = Array.from({ length: instance.parameters.horizonWeeks }, (_, i) => i + 1);
  const usedWeeks = submission.occupancy.map((row) => row.week);
  // A schedule may overflow past the horizon; show those weeks rather than
  // silently cropping work off the right-hand edge.
  const lastWeek = Math.max(instance.parameters.horizonWeeks, ...(usedWeeks.length ? usedWeeks : [0]));
  for (let week = instance.parameters.horizonWeeks + 1; week <= lastWeek; week += 1) {
    weeks.push(week);
  }

  const byLocationWeek = new Map<string, { possessions: Set<string>; activities: Set<string> }>();
  for (const row of submission.occupancy) {
    const key = `${row.locationId}|${row.week}`;
    const entry = byLocationWeek.get(key) ?? { possessions: new Set(), activities: new Set() };
    entry.possessions.add(row.coShareGroup);
    entry.activities.add(row.activityId);
    byLocationWeek.set(key, entry);
  }

  const sectorOrder = new Map<string, number>();
  instance.sectors.forEach((sector, index) => sectorOrder.set(sector.sectorId, sector.seq ?? index));
  const stationOrder = new Map<string, number>();
  for (const station of instance.stations) {
    stationOrder.set(`${station.lineCode}|${station.stationId}`, station.seq);
  }

  const rows: TimelineRow[] = [];
  // Iterate the network's index rather than the raw rows: it is the same supply
  // data the validator and scheduler resolve capacity through, so a timeline can
  // never disagree with them about what a location holds.
  for (const supply of network.supply.values()) {
    const parsed = parseLocationId(supply.locationId);
    const seq =
      parsed.kind === "SEC"
        ? (sectorOrder.get(`SEC:${parsed.lineCode}:${parsed.fromStationId}_${parsed.toStationId}`) ?? 0) * 2 + 1
        : (stationOrder.get(`${parsed.lineCode}|${parsed.stationId}`) ?? 0) * 2;

    const cells = new Map<number, TimelineCell>();
    let peak = 0;
    for (const week of weeks) {
      const entry = byLocationWeek.get(`${supply.locationId}|${week}`);
      if (!entry) continue;
      const possessions = entry.possessions.size;
      const effectiveCapacity = capacityAt(network, disruptions, supply.locationId, week);
      if (possessions >= effectiveCapacity) peak += 1;
      cells.set(week, {
        week,
        possessions,
        nominalCapacity: supply.supplyCapacity,
        effectiveCapacity,
        capacity: effectiveCapacity,
        disrupted: effectiveCapacity !== supply.supplyCapacity,
        activityIds: [...entry.activities].sort(),
        load: effectiveCapacity === 0 ? (possessions > 0 ? Number.POSITIVE_INFINITY : 0) : possessions / effectiveCapacity,
      });
    }

    rows.push({
      locationId: supply.locationId,
      lineCode: supply.lineCode,
      bound: supply.bound,
      kind: parsed.kind,
      seq,
      label:
        parsed.kind === "SEC"
          ? `${parsed.fromStationId}–${parsed.toStationId}`
          : parsed.stationId,
      capacity: supply.supplyCapacity,
      cells,
      peak,
    });
  }

  const order = (a: TimelineRow, b: TimelineRow) =>
    a.lineCode.localeCompare(b.lineCode) ||
    a.bound.localeCompare(b.bound) ||
    a.seq - b.seq ||
    a.locationId.localeCompare(b.locationId);

  const used = rows.filter((row) => row.cells.size > 0).sort(order);
  const empty = rows.filter((row) => row.cells.size === 0).sort(order);
  const maxLoad = used.reduce(
    (max, row) => Math.max(max, ...[...row.cells.values()].map((cell) => cell.load)),
    0,
  );

  return { weeks, rows: used, emptyRows: empty, maxLoad };
}
