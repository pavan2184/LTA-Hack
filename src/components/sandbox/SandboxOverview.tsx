"use client";

import { PlannerAssistant } from "@/components/assistant/PlannerAssistant";
import { Figure } from "@/components/shared/Figure";
import { SandboxPageHeading } from "@/components/sandbox/SandboxPageHeading";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import { PLANNING_NIGHT, WINDOW_END } from "@railplan/core/data/requests";
import { formatClock } from "@railplan/core/engine/intervals";
import { conflictsMetric } from "@railplan/core/engine/metrics";

export function SandboxOverview() {
  return (
    <section aria-label="Sandbox overview" className="space-y-2.5">
      <SandboxPageHeading
        title="Overview"
        description="Headline plan health, supporting calculations and an assistant grounded in the current plan."
      />
      <PlanSignals />
      <div className="grid min-w-0 gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <section className="min-w-0 space-y-2.5 border border-rule bg-surface p-3">
          <h3 className="text-[12px] font-medium text-ink-900">
            Secondary calculations
          </h3>
          <SecondaryFigures />
        </section>
        <div className="min-h-[360px] min-w-0">
          <PlannerAssistant />
        </div>
      </div>
    </section>
  );
}

/** Headline figures selected for the planner's current workflow step. */
export function PlanSignals() {
  const result = useRailPlanStore((state) => state.activeResult());
  const baselineConflicts = useRailPlanStore((state) => state.baselineConflicts);
  const view = useRailPlanStore((state) => state.view);
  if (!result) return null;

  const metrics = result.metrics;
  // Clashes, not rule findings: the same collision breaking three rules is one
  // problem. The raw finding count stays inside the formula for inspection.
  const conflicts = conflictsMetric(result.violations);

  if (view === "submitted") {
    return (
      <section aria-label="Plan signals" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Figure
          metric={{ ...metrics.placed, label: "Requests received" }}
          secondary={`for ${PLANNING_NIGHT}, 00:00-${formatClock(WINDOW_END)}`}
        />
        <Figure
          metric={conflicts}
          secondary={conflicts.value ? `across ${metrics.conflictedRequests.value} of ${metrics.conflictedRequests.denominator} requests` : "validator found none"}
          tone={conflicts.value ? "red" : "green"}
        />
        <Figure metric={metrics.teamUtilisation} secondary="crew minutes against rostered shifts" />
        <Figure metric={metrics.blockUtilisation} secondary="block-minutes against the window" />
      </section>
    );
  }

  return (
    <section aria-label="Plan signals" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      <Figure
        metric={{ ...metrics.placed, label: "Requests with a slot" }}
        secondary={result.plan.deferred.length ? `${result.plan.deferred.length} without a slot · see Conflicts` : "every request placed"}
        tone={result.plan.deferred.length ? "amber" : "green"}
      />
      <Figure
        metric={metrics.criticalPlaced}
        secondary={`of ${metrics.criticalPlaced.denominator} mandatory requests`}
        tone={metrics.criticalPlaced.value < metrics.criticalPlaced.denominator ? "red" : "green"}
      />
      <Figure
        metric={conflicts}
        secondary={`down from ${baselineConflicts} in the requests as submitted`}
        tone={conflicts.value ? "red" : "green"}
      />
      <Figure
        metric={metrics.movement}
        secondary={`${metrics.movement.denominator} of ${result.plan.placements.length} jobs moved`}
      />
    </section>
  );
}

export function SecondaryFigures() {
  const result = useRailPlanStore((state) => state.activeResult());
  const view = useRailPlanStore((state) => state.view);
  const disruptionMetrics = useRailPlanStore((state) => state.disruptionMetrics);
  if (!result) return null;
  const metrics = result.metrics;
  const workforce = disruptionMetrics ?? metrics;

  return (
    <div className="grid auto-rows-min grid-cols-2 gap-2.5">
      {view === "submitted" ? (
        <Figure metric={metrics.movement} secondary={`${metrics.movement.denominator} jobs moved`} />
      ) : (
        <Figure metric={metrics.blockUtilisation} />
      )}
      {view === "submitted" ? (
        <Figure metric={metrics.criticalPlaced} secondary="mandatory work in this plan" />
      ) : (
        <Figure metric={metrics.teamUtilisation} />
      )}
      <Figure metric={metrics.equipmentUtilisation} />
      <Figure
        metric={workforce.workforceUtilisation}
        secondary={disruptionMetrics ? "disruption impact before replanning" : "people-minutes against role availability"}
      />
      <Figure
        metric={workforce.workforceShortageIntervals}
        secondary="team and role windows requiring more staff"
        tone={workforce.workforceShortageIntervals.value ? "red" : "green"}
      />
      <Figure metric={metrics.bufferCompliance} />
      <Figure metric={metrics.weightedCompletion} secondary="priority-weighted" />
      <Figure metric={metrics.flexibility} />
    </div>
  );
}
