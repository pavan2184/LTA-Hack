import type { Disruption } from "./disruption";
import type { Pin } from "./schedule";
import type { PlanDiff, Scenario, ValidationReport } from "../types/ps1";

/** Build the copyable, auxiliary handover without changing the official submission. */
export function buildHandoverSummary(input: {
  scenario: Scenario;
  report: ValidationReport;
  pins: Pin[];
  disruptions: Disruption[];
  recentAction: string | null;
  diff: PlanDiff | null;
}): string {
  const { scenario, report, pins, disruptions, recentAction, diff } = input;
  return [
    `PS1 planning handover — Scenario ${scenario}`,
    `Validation: ${report.feasible ? "FEASIBLE" : "INVALID"}; local conformance; objective ${report.objectiveScore ?? "n/a"}`,
    `Pins: ${pins.length ? pins.map((pin) => `${pin.activityId}@wk${pin.week}`).join(", ") : "none"}`,
    `Disruptions: ${disruptions.length ? disruptions.map((item) => `${item.locationId}@wk${item.fromWeek}-${item.toWeek ?? "open"}→${item.capacity}`).join(", ") : "none"}`,
    `Recent change: ${recentAction ?? "none"}`,
    `Schedule stability: ${diff ? `${diff.unchangedAccessPercent}% unchanged; ${diff.movedAccesses} moved accesses` : "no applied comparison"}`,
    `Unresolved violations: ${report.hardViolations.length}`,
    `Closure checking: weekly exclusions and transitive co-sharing (${report.conformance.closureModelVersion}).`,
    "Undecidable locally: cross-possession physical-night alignment (official output has no global night identifier).",
    "Official ZIP: A/B/C × RESULTS.csv, SCHEDULE_ACCESS.csv and SCHEDULE_OCCUPANCY.csv only.",
  ].join("\n");
}
