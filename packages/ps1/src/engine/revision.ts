import type { PlanDiff, Submission, ValidationReport } from "../types/ps1";

const accessKey = (row: Submission["access"][number]) =>
  `${row.activityId}|${row.accessSeq}|${row.week}|${row.eclo}|${row.accessNight}`;
const violationKey = (rule: ValidationReport["hardViolations"][number]) =>
  `${rule.rule}|${rule.detail}`;

export function comparePlans(
  before: Submission,
  beforeReport: ValidationReport,
  after: Submission,
  afterReport: ValidationReport,
): PlanDiff {
  const beforeRows = new Set(before.access.map(accessKey));
  const afterRows = new Set(after.access.map(accessKey));
  const movedActivityIds = new Set<string>();
  let changedRows = 0;
  for (const row of before.access) {
    if (!afterRows.has(accessKey(row))) {
      changedRows += 1;
      movedActivityIds.add(row.activityId);
    }
  }
  for (const row of after.access) {
    if (!beforeRows.has(accessKey(row))) {
      changedRows += 1;
      movedActivityIds.add(row.activityId);
    }
  }

  const beforeResults = new Map(before.results.map((row) => [row.contractNumber, row]));
  const changedContracts = after.results
    .filter((row) => {
      const previous = beforeResults.get(row.contractNumber);
      return (
        !previous ||
        previous.simulatedCompletionDate !== row.simulatedCompletionDate ||
        previous.overrunDays !== row.overrunDays
      );
    })
    .map((row) => row.contractNumber)
    .sort();

  const beforeViolations = new Set(beforeReport.hardViolations.map(violationKey));
  const afterViolations = new Set(afterReport.hardViolations.map(violationKey));
  return {
    scoreBefore: beforeReport.objectiveScore ?? null,
    scoreAfter: afterReport.objectiveScore ?? null,
    feasibleBefore: beforeReport.feasible,
    feasibleAfter: afterReport.feasible,
    movedAccesses: Math.ceil(changedRows / 2),
    movedActivityIds: [...movedActivityIds].sort(),
    changedContracts,
    newViolations: afterReport.hardViolations.filter(
      (violation) => !beforeViolations.has(violationKey(violation)),
    ),
    resolvedViolations: beforeReport.hardViolations.filter(
      (violation) => !afterViolations.has(violationKey(violation)),
    ),
  };
}

export function planningLogJson(entries: unknown[]): string {
  return `${JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), entries }, null, 2)}\n`;
}
