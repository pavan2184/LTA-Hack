import type { Submission } from "../types/ps1";

/**
 * Serialise a submission to the three published CSV schemas.
 *
 * Column order is fixed by the brief and is part of the contract, so it is
 * written literally rather than derived from object keys. Rows are sorted for
 * a stable diff between runs; the validator does not care about order, but a
 * reviewer comparing two schedules does.
 */

export function writeAccessCsv(submission: Submission): string {
  const rows = [...submission.access].sort(
    (a, b) =>
      a.activityId.localeCompare(b.activityId) || a.accessSeq - b.accessSeq || a.week - b.week,
  );
  return [
    "activity_id,access_seq,week,eclo,access_night",
    ...rows.map((r) => `${r.activityId},${r.accessSeq},${r.week},${r.eclo},${r.accessNight}`),
  ].join("\n") + "\n";
}

export function writeOccupancyCsv(submission: Submission): string {
  const rows = [...submission.occupancy].sort(
    (a, b) =>
      a.activityId.localeCompare(b.activityId) ||
      a.week - b.week ||
      a.locationId.localeCompare(b.locationId),
  );
  return [
    "activity_id,week,location_id,co_share_group",
    ...rows.map((r) => `${r.activityId},${r.week},${r.locationId},${r.coShareGroup}`),
  ].join("\n") + "\n";
}

export function writeResultsCsv(submission: Submission): string {
  const rows = [...submission.results].sort((a, b) =>
    a.contractNumber.localeCompare(b.contractNumber),
  );
  return [
    "scenario,contract_number,simulated_completion_date,overrun_days",
    ...rows.map(
      (r) => `${r.scenario},${r.contractNumber},${r.simulatedCompletionDate},${r.overrunDays}`,
    ),
  ].join("\n") + "\n";
}

export function writeSubmission(submission: Submission): Record<string, string> {
  return {
    "SCHEDULE_ACCESS.csv": writeAccessCsv(submission),
    "SCHEDULE_OCCUPANCY.csv": writeOccupancyCsv(submission),
    "RESULTS.csv": writeResultsCsv(submission),
  };
}
