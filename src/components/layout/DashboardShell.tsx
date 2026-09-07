"use client";

import { useState } from "react";

import { PlannerAssistant } from "@/components/assistant/PlannerAssistant";
import { PlanToolbar } from "@/components/controls/PlanToolbar";
import { DisruptionDialog } from "@/components/disruption/DisruptionDialog";
import { RequestInspector } from "@/components/insights/RequestInspector";
import { ViolationPanel } from "@/components/insights/ViolationPanel";
import { PlanningPanels } from "@/components/layout/PlanningPanels";
import { SolverBar } from "@/components/layout/SolverBar";
import { RequestQueue } from "@/components/requests/RequestQueue";
import { BlockTimeline } from "@/components/schedule/BlockTimeline";
import { WorkforceTimeline } from "@/components/schedule/WorkforceTimeline";
import { GeographicNetworkView } from "@/components/network/GeographicNetworkView";
import { Figure } from "@/components/shared/Figure";
import { Button } from "@/components/ui/button";
import { disruptionById } from "@railplan/core/data/disruptions";
import { PLANNING_NIGHT, requestById, requests, SLOT_MINUTES, WINDOW_END } from "@railplan/core/data/requests";
import { trackBlocks } from "@railplan/core/domain/network";
import { formatClock } from "@railplan/core/engine/intervals";
import { plannerTimeSavedMetric } from "@railplan/core/engine/metrics";
import { ruleCatalogue } from "@railplan/core/engine/validate";
import { useRailPlanStore } from "@/store/useRailPlanStore";

export function DashboardShell() {
  const loaded = useRailPlanStore((state) => state.loaded);
  const stage = useRailPlanStore((state) => state.stage);

  return (
    <div className="min-h-screen bg-paper">
      <TopBar />
      {loaded ? <Workspace /> : <Landing />}
      {stage !== "idle" && <SolveOverlay />}
    </div>
  );
}

function TopBar() {
  const loaded = useRailPlanStore((state) => state.loaded);
  const reset = useRailPlanStore((state) => state.reset);

  return (
    <header className="sticky top-0 z-40 border-b border-rule-strong bg-surface">
      <div className="mx-auto flex h-11 max-w-[1720px] items-center gap-4 px-4">
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-semibold tracking-tight text-ink-900">RailPlan</span>
          <span className="text-[11px] text-ink-500">Overnight engineering planning</span>
        </div>
        <div className="ml-auto flex items-center gap-4 text-[11px] text-ink-500">
          <span className="hidden font-mono sm:inline">
            {PLANNING_NIGHT} &middot; 00:00-{formatClock(WINDOW_END)}
          </span>
          {loaded && (
            <Button size="sm" variant="quiet" onClick={reset}>
              Reset
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function Landing() {
  const load = useRailPlanStore((state) => state.load);

  return (
    <main className="mx-auto max-w-[720px] px-4 py-16">
      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-500">Prototype · fabricated data</p>
      <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight text-ink-900">
        {requests.length} maintenance requests. One four-hour window. {trackBlocks.length} track blocks.
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-700">
        RailPlan reads the requests as submitted, runs every operating constraint against them, and
        reports what collides. It then builds a schedule that satisfies those constraints, and checks
        its own answer before showing it to you.
      </p>

      <dl className="mt-6 grid gap-px border border-rule bg-rule sm:grid-cols-3">
        {[
          ["Conflict detection", `${Object.keys(ruleCatalogue).length} rules over atomic track blocks, crew capacity, workforce headcounts, asset counts, isolation zones, dependencies and travel.`],
          ["Scheduling", "Priority-ordered feasible insertion with repair, at " + SLOT_MINUTES + "-minute resolution. Status and solve time are reported honestly."],
          ["Every figure", "Carries its formula, numerator and denominator. Nothing on this dashboard is a stored score."],
        ].map(([term, detail]) => (
          <div key={term} className="bg-surface p-3">
            <dt className="text-[12px] font-medium text-ink-900">{term}</dt>
            <dd className="mt-1 text-[12px] leading-relaxed text-ink-500">{detail}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <Button variant="primary" onClick={load}>
          Load the submitted requests
        </Button>
      </div>

      <p className="mt-6 border-t border-rule pt-4 text-[11px] leading-relaxed text-ink-500">
        The network topology, crews, assets and requests are invented for this prototype. It encodes no
        LTA operating rule and must not be used for an operational decision.
      </p>
    </main>
  );
}

function Workspace() {
  const result = useRailPlanStore((state) => state.activeResult());
  const activeDisruptionId = useRailPlanStore((state) => state.activeDisruptionId);
  const hasReplanned = useRailPlanStore((state) => state.hasReplanned);
  const disruptionImpact = useRailPlanStore((state) => state.disruptionImpact);
  const replan = useRailPlanStore((state) => state.replan);
  const stage = useRailPlanStore((state) => state.stage);

  if (!result) return null;

  const scenario = activeDisruptionId ? disruptionById[activeDisruptionId] : null;
  const unresolved = disruptionImpact.filter((item) => item.severity === "critical");

  return (
    <main className="mx-auto max-w-[1720px] space-y-2.5 px-4 py-3">
      <PlanToolbar />
      <SolverBar />

      {scenario && !hasReplanned && (
        <section className="border border-signal-red bg-signal-red-soft px-3 py-2.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink-900">
                {scenario.title}: {unresolved.length} violation{unresolved.length === 1 ? "" : "s"} in the
                current plan
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-700">
                {scenario.description} The plan has been re-checked against this situation. Nothing has been
                rescheduled yet.
              </p>
            </div>
            <Button size="sm" variant="danger" onClick={replan} disabled={stage !== "idle"}>
              Solve around it
            </Button>
          </div>
        </section>
      )}

      {scenario && hasReplanned && <ReplanOutcome title={scenario.title} />}

      <PlanSignals />

      <PlanningPanels
        preferenceKey="railplan-demo-layout"
        queue={<RequestQueue />}
        primary={<BlockTimeline />}
        workforce={<WorkforceTimeline />}
        geography={<GeographicNetworkView />}
        belowPrimary={
          <div className="grid gap-2.5 xl:grid-cols-2">
            <ViolationPanel />
            <section className="grid content-start gap-2.5"><SecondaryFigures /></section>
          </div>
        }
        inspector={
          <div className="min-w-0 space-y-2.5">
            <RequestInspector />
            <div className="min-h-[300px]"><PlannerAssistant /></div>
          </div>
        }
      />

      <ScenarioTesting />

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3 text-[11px] text-ink-500">
        <span>
          Fabricated data. Encodes no LTA operating rule. Not for operational decisions.
        </span>
        <span>Human approval required before any plan is released.</span>
      </footer>
    </main>
  );
}

/**
 * The headline figures, chosen for the step the planner is on.
 *
 * Before scheduling the question is "how bad is this and what is idle"; after
 * scheduling it is "what did that buy me". Showing one set for both leaves half
 * the row answering a question nobody is asking yet.
 */
function PlanSignals() {
  const result = useRailPlanStore((state) => state.activeResult());
  const baselineConflicts = useRailPlanStore((state) => state.baselineConflicts);
  const view = useRailPlanStore((state) => state.view);
  if (!result) return null;

  const metrics = result.metrics;
  const remaining = metrics.violations.value;

  if (view === "submitted") {
    return (
      <section aria-label="Plan signals" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        <Figure
          metric={{ ...metrics.placed, label: "Requests received" }}
          secondary={`for ${PLANNING_NIGHT}, 00:00-${formatClock(WINDOW_END)}`}
        />
        <Figure
          metric={metrics.conflictedRequests}
          secondary={`of ${metrics.conflictedRequests.denominator} requests`}
          tone={metrics.conflictedRequests.value ? "red" : "green"}
        />
        <Figure
          metric={metrics.violations}
          secondary={metrics.violations.value ? "planner action required" : "validator found none"}
          tone={metrics.violations.value ? "red" : "green"}
        />
        <Figure metric={metrics.teamUtilisation} secondary="crew minutes against rostered shifts" />
        <Figure metric={metrics.blockUtilisation} secondary="block-minutes against the window" />
      </section>
    );
  }

  return (
    <section aria-label="Plan signals" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
      <Figure
        metric={metrics.violations}
        secondary={`down from ${baselineConflicts} in the requests as submitted`}
        tone={remaining ? "red" : "green"}
      />
      <Figure
        metric={metrics.placed}
        secondary={`${result.plan.deferred.length} without a slot`}
        tone={result.plan.deferred.length ? "amber" : "green"}
      />
      <Figure
        metric={metrics.criticalPlaced}
        secondary={`of ${metrics.criticalPlaced.denominator} mandatory requests`}
        tone={metrics.criticalPlaced.value < metrics.criticalPlaced.denominator ? "red" : "green"}
      />
      <Figure
        metric={metrics.movement}
        secondary={`${metrics.movement.denominator} of ${result.plan.placements.length} jobs moved`}
      />
      <Figure
        metric={plannerTimeSavedMetric(baselineConflicts, remaining)}
        secondary="estimated · see the formula"
      />
    </section>
  );
}

/**
 * Scenario testing, kept deliberately quiet.
 *
 * Absorbing a disruption is a good thing to be able to demonstrate, but it is
 * not the problem this tool exists to solve, and giving it a headline figure
 * and a top-level button said otherwise.
 */
function ScenarioTesting() {
  const [open, setOpen] = useState(false);
  const activeDisruptionId = useRailPlanStore((state) => state.activeDisruptionId);
  const clearDisruption = useRailPlanStore((state) => state.clearDisruption);
  const stage = useRailPlanStore((state) => state.stage);
  const result = useRailPlanStore((state) => state.activeResult());

  const capacity = result?.metrics.emergencyCapacity;

  return (
    <section className="border border-rule bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <h2 className="text-[12px] font-medium text-ink-900">Scenario testing</h2>
          <p className="text-[11px] leading-relaxed text-ink-500">
            Test whether this schedule can absorb an emergency, a crew going off, or a shortened
            window.
            {capacity
              ? ` ${capacity.numerator} of ${capacity.denominator} emergency scenarios currently fit without displacing mandatory work.`
              : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {activeDisruptionId && (
            <Button size="sm" variant="quiet" onClick={clearDisruption} disabled={stage !== "idle"}>
              Clear scenario
            </Button>
          )}
          <Button size="sm" variant="quiet" onClick={() => setOpen(true)} disabled={stage !== "idle"}>
            Test a disruption
          </Button>
        </div>
      </div>
      <DisruptionDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}

/**
 * The outcome of a re-solve.
 *
 * "Zero violations" and "this night can go ahead" are not the same statement.
 * A plan can satisfy every rule and still be unacceptable because mandatory
 * work had nowhere to go — so when that happens it is said plainly, and named,
 * rather than left for the planner to infer from a status code.
 */
function ReplanOutcome({ title }: { title: string }) {
  const result = useRailPlanStore((state) => state.activeResult());
  if (!result) return null;

  const droppedMandatory = result.plan.deferred
    .map((entry) => requestById[entry.requestId])
    .filter((request) => request?.mandatory);

  if (droppedMandatory.length) {
    return (
      <section className="border border-signal-red bg-signal-red-soft px-3 py-2.5">
        <p className="text-[13px] font-medium text-ink-900">
          No feasible plan covers this night with {title.toLowerCase()} applied.
        </p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-700">
          Every rule is satisfied, but {droppedMandatory.map((request) => request.id).join(", ")} —
          mandatory work — could not be placed at all.{" "}
          {result.plan.placements.length} of {result.metrics.placed.denominator} jobs fit around the
          disruption. This plan cannot be published until all mandatory work can be scheduled.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-signal-green bg-signal-green-soft px-3 py-2">
      <p className="text-[12px] leading-relaxed text-ink-700">
        Re-solved with {title.toLowerCase()} applied to the inputs. {result.plan.placements.length} jobs
        placed, {result.plan.deferred.length} deferred, {result.violations.length} violations remaining.
      </p>
    </section>
  );
}

function SecondaryFigures() {
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
      <Figure metric={workforce.workforceUtilisation} secondary={disruptionMetrics ? "disruption impact before replanning" : "people-minutes against role availability"} />
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

function SolveOverlay() {
  const stage = useRailPlanStore((state) => state.stage);
  const steps: { id: typeof stage; label: string }[] = [
    { id: "validating", label: "Running constraint rules over the submitted times" },
    { id: "solving", label: "Searching candidate start times" },
    { id: "verifying", label: "Re-validating the result independently" },
  ];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-rule-strong bg-surface px-4 py-2"
    >
      <div className="mx-auto flex max-w-[1720px] flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
        {steps.map((step, index) => {
          const currentIndex = steps.findIndex((item) => item.id === stage);
          const done = currentIndex > index;
          const active = currentIndex === index;
          return (
            <span
              key={step.id}
              className={
                done ? "text-signal-green" : active ? "text-ink-900" : "text-ink-400"
              }
            >
              {done ? "✓ " : active ? "→ " : "  "}
              {step.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
