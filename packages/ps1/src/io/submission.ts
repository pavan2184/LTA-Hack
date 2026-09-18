import type { AccessRow, OccupancyRow, ResultRow, Scenario, Submission } from "../types/ps1";
import { CsvError, parseCsv } from "./csv";

/**
 * The three submission files, named exactly as the brief publishes them.
 *
 * Lives here rather than beside the UI that reads them because both a server
 * component and a client component need the list, and a value exported from a
 * `"use client"` module arrives on the server as a reference proxy rather than
 * as the array itself.
 */
export const SUBMISSION_FILES = [
  "RESULTS.csv",
  "SCHEDULE_ACCESS.csv",
  "SCHEDULE_OCCUPANCY.csv",
] as const;

export type SubmissionFileName = (typeof SUBMISSION_FILES)[number];

export class SubmissionError extends Error {}

const HEADERS = {
  "SCHEDULE_ACCESS.csv": ["activity_id", "access_seq", "week", "eclo", "access_night"],
  "SCHEDULE_OCCUPANCY.csv": ["activity_id", "week", "location_id", "co_share_group"],
  "RESULTS.csv": ["scenario", "contract_number", "simulated_completion_date", "overrun_days"],
} as const;

function rows(text: string, file: keyof typeof HEADERS): Record<string, string>[] {
  try {
    return parseCsv(text, file, { expectedHeader: HEADERS[file], maxRows: 50_000 });
  } catch (cause) {
    if (cause instanceof CsvError) throw new SubmissionError(cause.message);
    throw cause;
  }
}

function num(raw: string, file: string, column: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new SubmissionError(`${file}: ${column} is not an integer: ${JSON.stringify(raw)}`);
  }
  return value;
}

export function parseAccess(text: string): AccessRow[] {
  return rows(text, "SCHEDULE_ACCESS.csv").map((row) => {
    const eclo = num(row.eclo, "SCHEDULE_ACCESS.csv", "eclo");
    if (eclo !== 0 && eclo !== 1) {
      throw new SubmissionError(`SCHEDULE_ACCESS.csv: eclo must be 0 or 1, received ${eclo}`);
    }
    return {
      activityId: row.activity_id,
      accessSeq: num(row.access_seq, "SCHEDULE_ACCESS.csv", "access_seq"),
      week: num(row.week, "SCHEDULE_ACCESS.csv", "week"),
      eclo,
      accessNight: num(row.access_night, "SCHEDULE_ACCESS.csv", "access_night"),
    };
  });
}

export function parseOccupancy(text: string): OccupancyRow[] {
  return rows(text, "SCHEDULE_OCCUPANCY.csv").map((row) => {
    if (!row.activity_id || !row.location_id || !row.co_share_group) {
      throw new SubmissionError(
        "SCHEDULE_OCCUPANCY.csv: activity_id, location_id and co_share_group must not be empty",
      );
    }
    return {
      activityId: row.activity_id,
      week: num(row.week, "SCHEDULE_OCCUPANCY.csv", "week"),
      locationId: row.location_id,
      coShareGroup: row.co_share_group,
    };
  });
}

export function parseResults(text: string): ResultRow[] {
  return rows(text, "RESULTS.csv").map((row) => {
    const scenario = row.scenario as Scenario;
    if (!["A", "B", "C"].includes(scenario)) {
      throw new SubmissionError(`RESULTS.csv: unknown scenario ${JSON.stringify(row.scenario)}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.simulated_completion_date)) {
      throw new SubmissionError(
        `RESULTS.csv: simulated_completion_date is not an ISO date: ${JSON.stringify(row.simulated_completion_date)}`,
      );
    }
    return {
      scenario,
      contractNumber: row.contract_number,
      simulatedCompletionDate: row.simulated_completion_date,
      overrunDays: num(row.overrun_days, "RESULTS.csv", "overrun_days"),
    };
  });
}

/** Read one scenario's three submission files. The brief rejects a mixed RESULTS.csv. */
export function parseSubmission(files: {
  access: string;
  occupancy: string;
  results: string;
}): Submission {
  const results = parseResults(files.results);
  const scenarios = new Set(results.map((row) => row.scenario));
  if (scenarios.size !== 1 || results.length === 0) {
    throw new SubmissionError(
      `RESULTS.csv must hold exactly one scenario, found ${[...scenarios].sort().join(", ") || "none"}`,
    );
  }
  return {
    scenario: [...scenarios][0],
    access: parseAccess(files.access),
    occupancy: parseOccupancy(files.occupancy),
    results,
  };
}
