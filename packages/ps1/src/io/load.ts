import type {
  AccessType,
  Activity,
  BufferRule,
  Bound,
  Contract,
  Line,
  LocationKind,
  LocationSupply,
  NatureOfWorks,
  Parameters,
  Ps1Instance,
  Sector,
  Station,
} from "../types/ps1";

/**
 * The eight instance files, named exactly as the brief publishes them.
 *
 * Judges upload a hidden instance in this shape, so the names are part of the
 * contract rather than a convention of ours.
 */
export const PS1_FILES = [
  "01_LINES.csv",
  "02_STATIONS.csv",
  "03_SECTORS.csv",
  "04_LOCATION_SUPPLY.csv",
  "05_BUFFER_LOCATION.csv",
  "06_PARAMETERS.csv",
  "07_PROJECT_DETAILS.csv",
  "08_ACTIVITY_DETAILS.csv",
] as const;

export type Ps1FileName = (typeof PS1_FILES)[number];
export type InstanceFiles = Partial<Record<Ps1FileName, string>>;

export class InstanceError extends Error {}

/**
 * A deliberately small CSV reader.
 *
 * The instance files are flat, comma-separated and quote-free in every sample
 * seen, but a hidden instance may quote a field containing a comma, so quoted
 * fields and doubled quotes are handled. Nothing else is: no embedded newlines,
 * no alternative delimiters. A file needing more than this is a malformed
 * instance and should fail loudly here rather than parse into something subtly
 * wrong that the validator then blames on the scheduler.
 */
function parseCsv(text: string, file: string): Record<string, string>[] {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (!lines.length) throw new InstanceError(`${file}: empty`);

  const split = (line: string): string[] => {
    const out: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 1;
          } else quoted = false;
        } else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        out.push(field);
        field = "";
      } else field += ch;
    }
    out.push(field);
    return out.map((value) => value.trim());
  };

  const header = split(lines[0]);
  return lines.slice(1).map((line, index) => {
    const cells = split(line);
    if (cells.length !== header.length) {
      throw new InstanceError(
        `${file}: row ${index + 2} has ${cells.length} fields, header has ${header.length}`,
      );
    }
    return Object.fromEntries(header.map((key, i) => [key, cells[i]]));
  });
}

function required(files: InstanceFiles, name: Ps1FileName): string {
  const text = files[name];
  if (text === undefined) throw new InstanceError(`Missing instance file: ${name}`);
  return text;
}

function int(row: Record<string, string>, key: string, file: string): number {
  const raw = row[key];
  if (raw === undefined) throw new InstanceError(`${file}: missing column ${key}`);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new InstanceError(`${file}: ${key} is not a number: ${JSON.stringify(raw)}`);
  }
  return value;
}

function tier(row: Record<string, string>, key: string, file: string): 1 | 2 | 3 {
  const value = int(row, key, file);
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new InstanceError(`${file}: ${key} must be 1, 2 or 3, received ${value}`);
  }
  return value;
}

const NATURES: NatureOfWorks[] = ["Live", "Non-live (Consist)", "Non-live (Others)"];

function nature(raw: string, file: string): NatureOfWorks {
  const match = NATURES.find((n) => n.toLowerCase() === raw.toLowerCase());
  if (!match) throw new InstanceError(`${file}: unknown nature_of_works ${JSON.stringify(raw)}`);
  return match;
}

function accessType(raw: string, file: string): AccessType {
  if (raw === "PM" || raw === "PC" || raw === "C") return raw;
  throw new InstanceError(`${file}: unknown access_type ${JSON.stringify(raw)}`);
}

function bound(raw: string, file: string): Bound {
  if (raw === "EB" || raw === "WB") return raw;
  throw new InstanceError(`${file}: unknown bound ${JSON.stringify(raw)}`);
}

function locationKind(raw: string, file: string): LocationKind {
  const value = raw.toLowerCase();
  if (value === "tunnel sector" || value === "platform sector") return value;
  throw new InstanceError(`${file}: unknown location_kind ${JSON.stringify(raw)}`);
}

/** Parse the eight published instance files into one typed instance. */
export function loadInstance(files: InstanceFiles): Ps1Instance {
  const read = (name: Ps1FileName) => parseCsv(required(files, name), name);

  const lines: Line[] = read("01_LINES.csv").map((row) => ({
    lineCode: row.line_code,
    lineName: row.line_name,
  }));

  const stations: Station[] = read("02_STATIONS.csv").map((row) => ({
    stationId: row.station_id,
    lineCode: row.line_code,
    seq: int(row, "seq", "02_STATIONS.csv"),
    isInterchange: int(row, "is_interchange", "02_STATIONS.csv") === 1,
  }));

  const sectors: Sector[] = read("03_SECTORS.csv").map((row) => ({
    sectorId: row.sector_id,
    lineCode: row.line_code,
    fromStationId: row.from_station_id,
    toStationId: row.to_station_id,
    seq: int(row, "seq", "03_SECTORS.csv"),
    isShared: int(row, "is_shared", "03_SECTORS.csv") === 1,
  }));

  const locationSupply: LocationSupply[] = read("04_LOCATION_SUPPLY.csv").map((row) => ({
    locationId: row.location_id,
    locationKind: locationKind(row.location_kind, "04_LOCATION_SUPPLY.csv"),
    lineCode: row.line_code,
    bound: bound(row.bound, "04_LOCATION_SUPPLY.csv"),
    supplyCapacity: int(row, "supply_capacity", "04_LOCATION_SUPPLY.csv"),
  }));

  const bufferRules: BufferRule[] = read("05_BUFFER_LOCATION.csv").map((row) => ({
    natureOfWorks: nature(row.nature_of_works, "05_BUFFER_LOCATION.csv"),
    upToBufferSectors: int(row, "up_to_buffer_sectors", "05_BUFFER_LOCATION.csv"),
    oppositeBoundRequired:
      int(row, "opposite_bound_required", "05_BUFFER_LOCATION.csv") === 1,
  }));

  const parameterRows = read("06_PARAMETERS.csv");
  const byKey = new Map(parameterRows.map((row) => [row.key, row.value]));
  const weeksRaw = byKey.get("horizon_weeks");
  const horizonWeeks = Number(weeksRaw);
  if (!Number.isFinite(horizonWeeks)) {
    throw new InstanceError(
      `06_PARAMETERS.csv: horizon_weeks is not a number: ${JSON.stringify(weeksRaw)}`,
    );
  }
  const horizonStart = byKey.get("horizon_start");
  if (!horizonStart) throw new InstanceError("06_PARAMETERS.csv: missing horizon_start");
  const parameters: Parameters = { horizonStart, horizonWeeks };

  const contracts: Contract[] = read("07_PROJECT_DETAILS.csv").map((row) => ({
    contractNumber: row.contract_number,
    contractDescription: row.contract_description,
    contractAwardDate: row.contract_award_date,
    activityType: row.activity_type,
    natureOfActivity: nature(row.nature_of_activity, "07_PROJECT_DETAILS.csv"),
    contractPriority: tier(row, "contract_priority", "07_PROJECT_DETAILS.csv"),
    contractCompletionDate: row.contract_completion_date,
    plannedCompletionDate: row.planned_completion_date,
    numberOfWorkfronts: int(row, "number_of_workfronts", "07_PROJECT_DETAILS.csv"),
    accessType: accessType(row.access_type, "07_PROJECT_DETAILS.csv"),
    numberOfMaximumAccessPerWeek: int(
      row,
      "number_of_maximum_access_per_week",
      "07_PROJECT_DETAILS.csv",
    ),
  }));

  const activities: Activity[] = read("08_ACTIVITY_DETAILS.csv").map((row) => ({
    activityId: row.activity_id,
    contractNumber: row.contract_number,
    activityType: row.activity_type,
    startLocationId: row.start_location_id,
    endLocationId: row.end_location_id,
    totalAccesses: int(row, "total_accesses", "08_ACTIVITY_DETAILS.csv"),
    plannedStartDate: row.planned_start_date,
    // The column is present but empty for activities with no predecessor;
    // an empty string would later compare unequal to every real id.
    predecessorActivityId: row.predecessor_activity_id || null,
    activityPriority: tier(row, "activity_priority", "08_ACTIVITY_DETAILS.csv"),
  }));

  return {
    lines,
    stations,
    sectors,
    locationSupply,
    bufferRules,
    parameters,
    contracts,
    activities,
  };
}
