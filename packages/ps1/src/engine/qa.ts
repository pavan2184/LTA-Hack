import type {
  PlanDiff,
  Ps1Instance,
  QaAnswer,
  Scenario,
  Submission,
  ValidationReport,
} from "../types/ps1";
import { buildNetwork, expandSpan, type Network } from "./network";
import { explainPlacement } from "./explain";

export interface QaContext {
  instance: Ps1Instance;
  submission: Submission;
  report: ValidationReport;
  comparisons?: Partial<Record<Scenario, ValidationReport>>;
  diff?: PlanDiff | null;
  network?: Network;
}

const unsupported = (): QaAnswer => ({
  kind: "unsupported",
  text: "I can explain an activity placement, a contract overrun, bottlenecks, scenario trade-offs, the latest reviewed change, or ECLO and excess-possession use.",
  facts: [],
  activityIds: [],
  locationIds: [],
});

/** Deterministic, engine-grounded answers. No model call and no invented facts. */
export function answerQuestion(question: string, context: QaContext): QaAnswer {
  const query = question.trim();
  if (!query) return unsupported();
  const upper = query.toUpperCase();
  const network = context.network ?? buildNetwork(context.instance);
  const activity = context.instance.activities.find((row) => upper.includes(row.activityId.toUpperCase()));
  if (activity) {
    const explanation = explainPlacement(
      context.instance,
      context.submission,
      activity.activityId,
      network,
    );
    const weeks = context.submission.access
      .filter((row) => row.activityId === activity.activityId)
      .map((row) => row.week)
      .sort((a, b) => a - b);
    const locations = expandSpan(network, activity.startLocationId, activity.endLocationId);
    return {
      kind: "activity-placement",
      text: explanation?.summary ?? `${activity.activityId} has no scheduled placement to explain.`,
      facts: [
        `Contract ${activity.contractNumber}`,
        `Scheduled weeks: ${weeks.join(", ") || "none"}`,
        `Required workload: ${activity.totalAccesses} access-nights`,
      ],
      activityIds: [activity.activityId],
      locationIds: locations,
    };
  }

  const contract = context.instance.contracts.find((row) =>
    upper.includes(row.contractNumber.toUpperCase()),
  );
  if (contract) {
    const result = context.submission.results.find(
      (row) => row.contractNumber === contract.contractNumber,
    );
    const finalActivities = context.instance.activities
      .filter((row) => row.contractNumber === contract.contractNumber)
      .map((row) => row.activityId)
      .filter((id) => {
        const weeks = context.submission.access.filter((row) => row.activityId === id).map((row) => row.week);
        return weeks.length && result
          ? Math.max(...weeks) === Math.max(
              ...context.submission.access
                .filter((row) => {
                  const owner = context.instance.activities.find((item) => item.activityId === row.activityId);
                  return owner?.contractNumber === contract.contractNumber;
                })
                .map((row) => row.week),
            )
          : false;
      });
    return {
      kind: "contract-overrun",
      text: result?.overrunDays
        ? `${contract.contractNumber} completes on ${result.simulatedCompletionDate}, ${result.overrunDays} days after its planned date.`
        : `${contract.contractNumber} has no scored overrun in this schedule.`,
      facts: [
        `Planned completion: ${contract.plannedCompletionDate}`,
        `Simulated completion: ${result?.simulatedCompletionDate ?? "not scheduled"}`,
        `Activities finishing the contract: ${finalActivities.join(", ") || "none"}`,
      ],
      activityIds: finalActivities,
      locationIds: [],
    };
  }

  if (/BOTTLENECK|CAPACITY|BUSIEST|PRESSURE/.test(upper)) {
    const locations = context.report.detail.capacityHotspots.slice(0, 8);
    return {
      kind: "bottleneck",
      text: locations.length
        ? `${context.report.detail.capacityHotspots.length} location-weeks reach nominal capacity; the first are ${locations.join(", ")}.`
        : "No location-week reaches nominal capacity in this scenario.",
      facts: [
        `Excess access-nights: ${context.report.softScores.excessAccessNightsTotal}`,
        `Access-nights scheduled: ${context.report.detail.nightsScheduled}`,
      ],
      activityIds: [],
      locationIds: locations.map((value) => value.split("@wk")[0]),
    };
  }

  if (/SCENARIO|COMPARE|TRADE.?OFF| A | B | C /.test(` ${upper} `) && context.comparisons) {
    const facts = (["A", "B", "C"] as Scenario[])
      .map((scenario) => context.comparisons?.[scenario])
      .filter((report): report is ValidationReport => Boolean(report))
      .map(
        (report) =>
          `${report.scenario}: objective ${report.objectiveScore ?? "n/a"}, overrun ${report.softScores.overrunDaysTotal}, excess ${report.softScores.excessAccessNightsTotal}, ECLO ${report.softScores.ecloNightsTotal}`,
      );
    return {
      kind: "scenario-comparison",
      text: "The objectives use different rule sets, so compare the physical consequences rather than ranking the three objective numbers directly.",
      facts,
      activityIds: [],
      locationIds: [],
    };
  }

  if (/CHANGE|MOVED|PIN|DISRUPT|DIFF/.test(upper) && context.diff) {
    return {
      kind: "change-impact",
      text: `${context.diff.movedAccesses} accesses across ${context.diff.movedActivityIds.length} activities move in the reviewed change.`,
      facts: [
        `Score: ${context.diff.scoreBefore ?? "n/a"} → ${context.diff.scoreAfter ?? "n/a"}`,
        `Feasible: ${context.diff.feasibleBefore ? "yes" : "no"} → ${context.diff.feasibleAfter ? "yes" : "no"}`,
        `Changed contracts: ${context.diff.changedContracts.join(", ") || "none"}`,
      ],
      activityIds: context.diff.movedActivityIds,
      locationIds: [],
    };
  }

  if (/ECLO|EXCESS|LEVER|NIGHT/.test(upper)) {
    const { ecloNightsTotal, excessAccessNightsTotal, priorityWeightedScore } = context.report.softScores;
    return {
      kind: "scenario-lever",
      text: `Scenario ${context.report.scenario} uses ${ecloNightsTotal} ECLO nights and ${excessAccessNightsTotal} excess access-nights.`,
      facts: [
        `Priority-weighted overrun: ${priorityWeightedScore}`,
        "Each ECLO night costs 5; each excess access-night costs 7.",
      ],
      activityIds: [],
      locationIds: [],
    };
  }

  return unsupported();
}
