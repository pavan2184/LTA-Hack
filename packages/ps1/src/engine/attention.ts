import type { Disruption } from "./disruption";
import { buildNetwork, type Network } from "./network";
import type { Pin, RejectedPin } from "./schedule";
import { buildTimeline } from "./timeline";
import type {
  AttentionItem,
  AttentionSeverity,
  PlanDiff,
  Ps1Instance,
  Submission,
  ValidationReport,
} from "../types/ps1";

export interface AttentionInput {
  instance: Ps1Instance;
  submission?: Submission;
  report?: ValidationReport;
  pins?: Pin[];
  rejectedPins?: RejectedPin[];
  disruptions?: Disruption[];
  diff?: PlanDiff | null;
  network?: Network;
}

const RANK: Record<AttentionSeverity, number> = {
  blocking: 0,
  critical: 1,
  warning: 2,
  change: 3,
  normal: 4,
};

/**
 * Turn solver and validator facts into one stable exception-first queue.
 * This projection does not decide feasibility; it only orders facts already
 * produced by the engine so every UI surface tells the same operational story.
 */
export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const {
    instance,
    submission,
    report,
    rejectedPins = [],
    disruptions = [],
    diff,
    network = buildNetwork(instance),
  } = input;
  const items: AttentionItem[] = [];
  const activityById = new Map(instance.activities.map((activity) => [activity.activityId, activity]));
  const contractByNumber = new Map(instance.contracts.map((contract) => [contract.contractNumber, contract]));
  const resultByContract = new Map(submission?.results.map((result) => [result.contractNumber, result]) ?? []);
  const accessByActivity = new Map<string, Submission["access"]>();
  for (const row of submission?.access ?? []) {
    const rows = accessByActivity.get(row.activityId) ?? [];
    rows.push(row);
    accessByActivity.set(row.activityId, rows);
  }

  for (const [index, violation] of (report?.hardViolations ?? []).entries()) {
    const activityIds = instance.activities
      .filter((activity) => violation.detail.includes(activity.activityId))
      .map((activity) => activity.activityId);
    items.push({
      id: `violation:${violation.rule}:${index}`,
      severity: "blocking",
      kind: "violation",
      label: `${violation.rule.replaceAll("_", " ")} violation`,
      detail: violation.detail,
      activityIds,
      contractNumbers: [...new Set(activityIds.map((id) => activityById.get(id)!.contractNumber))].sort(),
      locationIds: [...network.supply.keys()].filter((id) => violation.detail.includes(id)).sort(),
      weeks: [...violation.detail.matchAll(/wk(?:eek)?\s*(\d+)/gi)].map((match) => Number(match[1])),
    });
  }

  for (const activity of instance.activities) {
    const rows = accessByActivity.get(activity.activityId) ?? [];
    if (submission && rows.length === 0) {
      items.push({
        id: `unscheduled:${activity.activityId}`,
        severity: "blocking",
        kind: "unscheduled",
        label: `${activity.activityId} is unscheduled`,
        detail: "The activity has no access rows and cannot satisfy the complete-workload gate.",
        activityIds: [activity.activityId],
        contractNumbers: [activity.contractNumber],
        locationIds: [],
        weeks: [],
      });
      continue;
    }
    const contract = contractByNumber.get(activity.contractNumber)!;
    const result = resultByContract.get(activity.contractNumber);
    if (contract.contractPriority === 1 && (result?.overrunDays ?? 0) > 0) {
      items.push({
        id: `p1-risk:${activity.activityId}`,
        severity: "critical",
        kind: "p1-risk",
        label: `${activity.activityId} contributes to P1 delay`,
        detail: `${activity.contractNumber} overruns by ${result!.overrunDays} days.`,
        activityIds: [activity.activityId],
        contractNumbers: [activity.contractNumber],
        locationIds: [],
        weeks: rows.map((row) => row.week).sort((a, b) => a - b),
      });
    }
  }

  for (const rejected of rejectedPins) {
    const activity = activityById.get(rejected.activityId);
    items.push({
      id: `rejected:${rejected.activityId}:${rejected.week}`,
      severity: "critical",
      kind: "rejected-constraint",
      label: `${rejected.activityId} could not be pinned`,
      detail: rejected.reason,
      activityIds: [rejected.activityId],
      contractNumbers: activity ? [activity.contractNumber] : [],
      locationIds: [],
      weeks: [rejected.week],
    });
  }

  if (submission) {
    const timeline = buildTimeline(instance, submission, network, disruptions);
    for (const row of timeline.rows) {
      const capacityCells = [...row.cells.values()]
        .filter((cell) => cell.load >= 1 && !cell.disrupted)
        .sort((a, b) => b.load - a.load || a.week - b.week);

      // Capacity pressure is useful as a location-level exception, not as one
      // queue row for every occupied week. Keep the peak weeks linked so the
      // planner can still inspect each occurrence without drowning the queue.
      const peakLoad = capacityCells[0]?.load;
      const peakCells = peakLoad === undefined
        ? []
        : capacityCells.filter((cell) => cell.load === peakLoad);
      if (peakCells.length > 0) {
        const activityIds = [...new Set(peakCells.flatMap((cell) => cell.activityIds))].sort();
        const contractNumbers = [...new Set(
          activityIds
            .map((id) => activityById.get(id)?.contractNumber)
            .filter((id): id is string => Boolean(id)),
        )].sort();
        items.push({
          id: `capacity:${row.locationId}`,
          severity: peakLoad > 1 ? "critical" : "warning",
          kind: "capacity",
          label: `${row.label} reaches capacity`,
          detail: `${peakCells[0].possessions}/${peakCells[0].effectiveCapacity} effective possessions across ${peakCells.length} peak week${peakCells.length === 1 ? "" : "s"}.`,
          activityIds,
          contractNumbers,
          locationIds: [row.locationId],
          weeks: peakCells.map((cell) => cell.week).sort((a, b) => a - b),
        });
      }

      for (const cell of row.cells.values()) {
        if (!cell.disrupted) continue;
        items.push({
          id: `disruption:${row.locationId}:${cell.week}`,
          severity: cell.load > 1 ? "critical" : "warning",
          kind: "disruption",
          label: `${row.label} wk${cell.week} is disrupted`,
          detail: `${cell.possessions}/${cell.effectiveCapacity} effective possessions (nominal ${cell.nominalCapacity}).`,
          activityIds: cell.activityIds,
          contractNumbers: [...new Set(cell.activityIds.map((id) => activityById.get(id)?.contractNumber).filter((id): id is string => Boolean(id)))].sort(),
          locationIds: [row.locationId],
          weeks: [cell.week],
        });
      }
    }
  }

  for (const activityId of diff?.movedActivityIds ?? []) {
    const activity = activityById.get(activityId);
    items.push({
      id: `change:${activityId}`,
      severity: "change",
      kind: "recent-change",
      label: `${activityId} moved in the latest proposal`,
      detail: "Review the Changes tab for the before-and-after effect.",
      activityIds: [activityId],
      contractNumbers: activity ? [activity.contractNumber] : [],
      locationIds: [],
      weeks: [],
    });
  }

  const represented = new Set(items.flatMap((item) => item.activityIds));
  for (const activity of instance.activities) {
    if (represented.has(activity.activityId)) continue;
    const contract = contractByNumber.get(activity.contractNumber)!;
    const rows = accessByActivity.get(activity.activityId) ?? [];
    const usesLever = rows.some((row) => row.eclo === 1);
    items.push({
      id: `${usesLever ? "lever" : "activity"}:${activity.activityId}`,
      severity: usesLever ? "warning" : "normal",
      kind: usesLever ? "scenario-lever" : "activity",
      label: activity.activityId,
      detail: `${activity.contractNumber} · ${contract.accessType} · ${contract.natureOfActivity}`,
      activityIds: [activity.activityId],
      contractNumbers: [activity.contractNumber],
      locationIds: [],
      weeks: rows.map((row) => row.week).sort((a, b) => a - b),
    });
  }

  return items.sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] ||
      (a.weeks[0] ?? Number.MAX_SAFE_INTEGER) - (b.weeks[0] ?? Number.MAX_SAFE_INTEGER) ||
      a.id.localeCompare(b.id),
  );
}
