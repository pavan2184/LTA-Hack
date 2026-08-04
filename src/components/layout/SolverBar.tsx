"use client";

import { CircleCheck, CircleSlash, TriangleAlert } from "lucide-react";

import { requestById } from "@railplan/core/data/requests";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import type { SolveResult } from "@railplan/core/types/railplan";

const statusCopy: Record<SolveResult["status"], { label: string; tone: string; icon: typeof CircleCheck }> = {
  OPTIMAL: { label: "Optimal", tone: "text-signal-green", icon: CircleCheck },
  FEASIBLE: { label: "Feasible", tone: "text-signal-green", icon: CircleCheck },
  INFEASIBLE: { label: "Infeasible", tone: "text-signal-red", icon: CircleSlash },
  TIME_LIMIT: { label: "Time limit", tone: "text-signal-amber", icon: TriangleAlert },
};

/**
 * Provenance strip.
 *
 * Solver status, the version of the rules it ran against, how long it took, how
 * many candidate slots it looked at, and a digest of its inputs. Repeat a run
 * with the same hash and you must get the same plan; if you do not, this row is
 * where that shows up.
 */
export function SolverBar() {
  const result = useRailPlanStore((state) => state.activeResult());
  const stage = useRailPlanStore((state) => state.stage);
  const view = useRailPlanStore((state) => state.view);

  if (!result) return null;

  const status = statusCopy[result.status];
  const Icon = status.icon;
  const criticalCount = result.violations.filter((item) => item.severity === "critical").length;
  // A plan can pass every rule and still be unreleasable: satisfying the
  // constraints by dropping work that must happen is not the same as succeeding.
  const mandatoryDeferred = result.plan.deferred.some(
    (entry) => requestById[entry.requestId]?.mandatory,
  );

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border border-rule bg-surface px-3 py-1.5 text-[11px] text-ink-500">
      <span className={`flex items-center gap-1.5 font-medium ${status.tone}`}>
        <Icon className="size-3.5" />
        {view === "submitted" ? "Submitted plan" : "Solver"}: {status.label}
      </span>

      <span>
        {result.independentlyValidated ? (
          <span className="text-signal-green">Re-validated after solving: 0 violations</span>
        ) : (
          <span className="text-signal-red">
            {criticalCount} violation{criticalCount === 1 ? "" : "s"} outstanding
          </span>
        )}
      </span>

      <span className={mandatoryDeferred ? "text-signal-red" : undefined}>
        {result.plan.placements.length} placed &middot; {result.plan.deferred.length} deferred
        {mandatoryDeferred ? " · includes mandatory work" : ""}
      </span>

      <span>
        {stage === "idle" ? `${result.solveMs} ms` : "solving…"} &middot; {result.candidatesEvaluated}{" "}
        candidate slots
      </span>

      <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 font-mono">
        <span>{result.solverVersion}</span>
        <span>{result.constraintVersion}</span>
        <span title="Non-cryptographic digest of every input to this run">{result.inputHash}</span>
      </span>
    </div>
  );
}
