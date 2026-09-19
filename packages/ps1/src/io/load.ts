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
import { CsvError, parseCsv } from "./csv";

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

const HEADERS: Record<Ps1FileName, readonly string[]> = {
  "01_LINES.csv": ["line_code", "line_name"],
  "02_STATIONS.csv": ["station_id", "line_code", "seq", "is_interchange"],
  "03_SECTORS.csv": [
    "sector_id",
    "line_code",
    "from_station_id",
    "to_station_id",
    "seq",
    "is_shared",
  ],
  "04_LOCATION_SUPPLY.csv": [
    "location_id",
    "location_kind",
    "line_code",
    "bound",
    "supply_capacity",
  ],
  "05_BUFFER_LOCATION.csv": [
    "nature_of_works",
    "up_to_buffer_sectors",
    "opposite_bound_required",
  ],
  "06_PARAMETERS.csv": ["key", "value"],
  "07_PROJECT_DETAILS.csv": [
    "contract_number",
    "contract_description",
    "contract_award_date",
    "activity_type",
    "nature_of_activity",
    "contract_priority",
    "contract_completion_date",
    "planned_completion_date",
    "number_of_workfronts",
    "access_type",
    "number_of_maximum_access_per_week",
  ],
  "08_ACTIVITY_DETAILS.csv": [
    "activity_id",
    "contract_number",
    "activity_type",
    "start_location_id",
    "end_location_id",
    "total_accesses",
    "planned_start_date",
    "predecessor_activity_id",
    "activity_priority",
  ],
};

function required(files: InstanceFiles, name: Ps1FileName): string {
  const text = files[name];
  if (text === undefined) throw new InstanceError(`Missing instance file: ${name}`);
  return text;
}

function int(row: Record<string, string>, key: string, file: string): number {
  const raw = row[key];
  if (raw === undefined) throw new InstanceError(`${file}: missing column ${key}`);
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new InstanceError(`${file}: ${key} is not an integer: ${JSON.stringify(raw)}`);
  }
  return value;
}

function bool(row: Record<string, string>, key: string, file: string): boolean {
  const value = int(row, key, file);
  if (value !== 0 && value !== 1) {
    throw new InstanceError(`${file}: ${key} must be 0 or 1, received ${value}`);
  }
  return value === 1;
}

function nonempty(value: string, file: string, key: string): string {
  if (!value) throw new InstanceError(`${file}: ${key} must not be empty`);
  return value;
}

function isoDate(value: string, file: string, key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InstanceError(`${file}: ${key} is not an ISO date: ${JSON.stringify(value)}`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new InstanceError(`${file}: ${key} is not a real date: ${JSON.stringify(value)}`);
  }
  return value;
}

function positive(value: number, file: string, key: string, allowZero = false): number {
  if (value < (allowZero ? 0 : 1)) {
    throw new InstanceError(`${file}: ${key} must be ${allowZero ? "non-negative" : "positive"}`);
  }
  return value;
}

function unique<T>(items: T[], key: (item: T) => string, file: string, label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) throw new InstanceError(`${file}: duplicate ${label} ${value}`);
    seen.add(value);
  }
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
  const read = (name: Ps1FileName) => {
    try {
      return parseCsv(required(files, name), name, {
        expectedHeader: HEADERS[name],
        maxRows: 50_000,
      });
    } catch (cause) {
      if (cause instanceof InstanceError) throw cause;
      if (cause instanceof CsvError) throw new InstanceError(cause.message);
      throw cause;
    }
  };

  const lines: Line[] = read("01_LINES.csv").map((row) => ({
    lineCode: nonempty(row.line_code, "01_LINES.csv", "line_code"),
    lineName: nonempty(row.line_name, "01_LINES.csv", "line_name"),
  }));

  const stations: Station[] = read("02_STATIONS.csv").map((row) => ({
    stationId: nonempty(row.station_id, "02_STATIONS.csv", "station_id"),
    lineCode: nonempty(row.line_code, "02_STATIONS.csv", "line_code"),
    seq: positive(int(row, "seq", "02_STATIONS.csv"), "02_STATIONS.csv", "seq"),
    isInterchange: bool(row, "is_interchange", "02_STATIONS.csv"),
  }));

  const sectors: Sector[] = read("03_SECTORS.csv").map((row) => ({
    sectorId: nonempty(row.sector_id, "03_SECTORS.csv", "sector_id"),
    lineCode: nonempty(row.line_code, "03_SECTORS.csv", "line_code"),
    fromStationId: nonempty(row.from_station_id, "03_SECTORS.csv", "from_station_id"),
    toStationId: nonempty(row.to_station_id, "03_SECTORS.csv", "to_station_id"),
    seq: positive(int(row, "seq", "03_SECTORS.csv"), "03_SECTORS.csv", "seq"),
    isShared: bool(row, "is_shared", "03_SECTORS.csv"),
  }));

  const locationSupply: LocationSupply[] = read("04_LOCATION_SUPPLY.csv").map((row) => ({
    locationId: nonempty(row.location_id, "04_LOCATION_SUPPLY.csv", "location_id"),
    locationKind: locationKind(row.location_kind, "04_LOCATION_SUPPLY.csv"),
    lineCode: nonempty(row.line_code, "04_LOCATION_SUPPLY.csv", "line_code"),
    bound: bound(row.bound, "04_LOCATION_SUPPLY.csv"),
    supplyCapacity: positive(
      int(row, "supply_capacity", "04_LOCATION_SUPPLY.csv"),
      "04_LOCATION_SUPPLY.csv",
      "supply_capacity",
      true,
    ),
  }));

  const bufferRules: BufferRule[] = read("05_BUFFER_LOCATION.csv").map((row) => ({
    natureOfWorks: nature(row.nature_of_works, "05_BUFFER_LOCATION.csv"),
    upToBufferSectors: positive(
      int(row, "up_to_buffer_sectors", "05_BUFFER_LOCATION.csv"),
      "05_BUFFER_LOCATION.csv",
      "up_to_buffer_sectors",
      true,
    ),
    oppositeBoundRequired: bool(
      row,
      "opposite_bound_required",
      "05_BUFFER_LOCATION.csv",
    ),
  }));

  const parameterRows = read("06_PARAMETERS.csv");
  unique(parameterRows, (row) => row.key, "06_PARAMETERS.csv", "parameter");
  const allowedParameters = new Set(["horizon_start", "horizon_weeks"]);
  for (const row of parameterRows) {
    if (!allowedParameters.has(row.key)) {
      throw new InstanceError(`06_PARAMETERS.csv: unknown parameter ${row.key}`);
    }
  }
  const byKey = new Map(parameterRows.map((row) => [row.key, row.value]));
  const weeksRaw = byKey.get("horizon_weeks");
  const horizonWeeks = Number(weeksRaw);
  if (!Number.isInteger(horizonWeeks) || horizonWeeks < 1) {
    throw new InstanceError(
      `06_PARAMETERS.csv: horizon_weeks is not a number: ${JSON.stringify(weeksRaw)}`,
    );
  }
  const horizonStartRaw = byKey.get("horizon_start");
  const horizonStart = horizonStartRaw
    ? isoDate(horizonStartRaw, "06_PARAMETERS.csv", "horizon_start")
    : undefined;
  if (!horizonStart) throw new InstanceError("06_PARAMETERS.csv: missing horizon_start");
  const parameters: Parameters = { horizonStart, horizonWeeks };

  const contracts: Contract[] = read("07_PROJECT_DETAILS.csv").map((row) => ({
    contractNumber: nonempty(row.contract_number, "07_PROJECT_DETAILS.csv", "contract_number"),
    contractDescription: nonempty(
      row.contract_description,
      "07_PROJECT_DETAILS.csv",
      "contract_description",
    ),
    contractAwardDate: isoDate(
      row.contract_award_date,
      "07_PROJECT_DETAILS.csv",
      "contract_award_date",
    ),
    activityType: nonempty(row.activity_type, "07_PROJECT_DETAILS.csv", "activity_type"),
    natureOfActivity: nature(row.nature_of_activity, "07_PROJECT_DETAILS.csv"),
    contractPriority: tier(row, "contract_priority", "07_PROJECT_DETAILS.csv"),
    contractCompletionDate: isoDate(
      row.contract_completion_date,
      "07_PROJECT_DETAILS.csv",
      "contract_completion_date",
    ),
    plannedCompletionDate: isoDate(
      row.planned_completion_date,
      "07_PROJECT_DETAILS.csv",
      "planned_completion_date",
    ),
    numberOfWorkfronts: positive(
      int(row, "number_of_workfronts", "07_PROJECT_DETAILS.csv"),
      "07_PROJECT_DETAILS.csv",
      "number_of_workfronts",
    ),
    accessType: accessType(row.access_type, "07_PROJECT_DETAILS.csv"),
    numberOfMaximumAccessPerWeek: positive(
      int(row, "number_of_maximum_access_per_week", "07_PROJECT_DETAILS.csv"),
      "07_PROJECT_DETAILS.csv",
      "number_of_maximum_access_per_week",
    ),
  }));

  const activities: Activity[] = read("08_ACTIVITY_DETAILS.csv").map((row) => ({
    activityId: nonempty(row.activity_id, "08_ACTIVITY_DETAILS.csv", "activity_id"),
    contractNumber: nonempty(row.contract_number, "08_ACTIVITY_DETAILS.csv", "contract_number"),
    activityType: nonempty(row.activity_type, "08_ACTIVITY_DETAILS.csv", "activity_type"),
    startLocationId: nonempty(
      row.start_location_id,
      "08_ACTIVITY_DETAILS.csv",
      "start_location_id",
    ),
    endLocationId: nonempty(row.end_location_id, "08_ACTIVITY_DETAILS.csv", "end_location_id"),
    totalAccesses: positive(
      int(row, "total_accesses", "08_ACTIVITY_DETAILS.csv"),
      "08_ACTIVITY_DETAILS.csv",
      "total_accesses",
    ),
    plannedStartDate: isoDate(
      row.planned_start_date,
      "08_ACTIVITY_DETAILS.csv",
      "planned_start_date",
    ),
    // The column is present but empty for activities with no predecessor;
    // an empty string would later compare unequal to every real id.
    predecessorActivityId: row.predecessor_activity_id || null,
    activityPriority: tier(row, "activity_priority", "08_ACTIVITY_DETAILS.csv"),
  }));

  const instance = {
    lines,
    stations,
    sectors,
    locationSupply,
    bufferRules,
    parameters,
    contracts,
    activities,
  };
  validateInstance(instance);
  return instance;
}

/** Referential checks shared by CSV loading and the typed server boundary. */
export function validateInstance(instance: Ps1Instance): void {
  unique(instance.lines, (row) => row.lineCode, "01_LINES.csv", "line_code");
  unique(
    instance.stations,
    (row) => `${row.lineCode}|${row.stationId}`,
    "02_STATIONS.csv",
    "line/station",
  );
  unique(instance.sectors, (row) => row.sectorId, "03_SECTORS.csv", "sector_id");
  unique(instance.locationSupply, (row) => row.locationId, "04_LOCATION_SUPPLY.csv", "location_id");
  unique(
    instance.bufferRules,
    (row) => row.natureOfWorks,
    "05_BUFFER_LOCATION.csv",
    "nature_of_works",
  );
  unique(instance.contracts, (row) => row.contractNumber, "07_PROJECT_DETAILS.csv", "contract_number");
  unique(instance.activities, (row) => row.activityId, "08_ACTIVITY_DETAILS.csv", "activity_id");

  const lines = new Set(instance.lines.map((row) => row.lineCode));
  const stations = new Set(instance.stations.map((row) => `${row.lineCode}|${row.stationId}`));
  const locations = new Set(instance.locationSupply.map((row) => row.locationId));
  const contracts = new Map(instance.contracts.map((row) => [row.contractNumber, row]));
  const activities = new Map(instance.activities.map((row) => [row.activityId, row]));

  for (const station of instance.stations) {
    if (!lines.has(station.lineCode)) {
      throw new InstanceError(`02_STATIONS.csv: ${station.stationId} references unknown line ${station.lineCode}`);
    }
  }
  for (const sector of instance.sectors) {
    if (!lines.has(sector.lineCode)) {
      throw new InstanceError(`03_SECTORS.csv: ${sector.sectorId} references unknown line ${sector.lineCode}`);
    }
    for (const stationId of [sector.fromStationId, sector.toStationId]) {
      if (!stations.has(`${sector.lineCode}|${stationId}`)) {
        throw new InstanceError(`03_SECTORS.csv: ${sector.sectorId} references unknown station ${stationId}`);
      }
    }
  }
  for (const location of instance.locationSupply) {
    if (!lines.has(location.lineCode) || !location.locationId.includes(`:${location.lineCode}:`)) {
      throw new InstanceError(`04_LOCATION_SUPPLY.csv: ${location.locationId} has inconsistent line ${location.lineCode}`);
    }
  }
  for (const activity of instance.activities) {
    const contract = contracts.get(activity.contractNumber);
    if (!contract) {
      throw new InstanceError(`08_ACTIVITY_DETAILS.csv: ${activity.activityId} references unknown contract ${activity.contractNumber}`);
    }
    if (activity.activityType !== contract.activityType) {
      throw new InstanceError(`08_ACTIVITY_DETAILS.csv: ${activity.activityId} activity_type does not match ${contract.contractNumber}`);
    }
    if (!locations.has(activity.startLocationId) || !locations.has(activity.endLocationId)) {
      throw new InstanceError(`08_ACTIVITY_DETAILS.csv: ${activity.activityId} references an unknown endpoint`);
    }
    if (activity.predecessorActivityId && !activities.has(activity.predecessorActivityId)) {
      throw new InstanceError(`08_ACTIVITY_DETAILS.csv: ${activity.activityId} references unknown predecessor ${activity.predecessorActivityId}`);
    }
    if (activity.predecessorActivityId === activity.activityId) {
      throw new InstanceError(`08_ACTIVITY_DETAILS.csv: ${activity.activityId} cannot precede itself`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (activityId: string) => {
    if (visited.has(activityId)) return;
    if (visiting.has(activityId)) {
      throw new InstanceError(`08_ACTIVITY_DETAILS.csv: predecessor cycle includes ${activityId}`);
    }
    visiting.add(activityId);
    const predecessor = activities.get(activityId)?.predecessorActivityId;
    if (predecessor) visit(predecessor);
    visiting.delete(activityId);
    visited.add(activityId);
  };
  for (const activity of instance.activities) visit(activity.activityId);
}
