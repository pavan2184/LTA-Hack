"use client";

import { ChevronRight, TriangleAlert, Undo2 } from "lucide-react";
import { useMemo } from "react";

import { categoryTone } from "@/components/insights/ViolationPanel";
import { Button } from "@/components/ui/button";
import { requests } from "@railplan/core/data/requests";
import { summariseConflicts } from "@railplan/core/engine/conflicts";
import { strategyList } from "@railplan/core/engine/strategies";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import type { StrategyId } from "@railplan/core/types/railplan";

/**
 * The workflow, stated as the three things that actually happen.
 *
 * A planner receives requests, finds out what collides, and gets a schedule. The
 * page is organised around that sequence rather than around a pair of plan
 * views, because "as submitted / as planned" describes the tool's internals and
 * not the job.
 */
export function PlanToolbar() {
  const strategy = useRailPlanStore((state) => state.strategy);
  const setStrategy = useRailPlanStore((state) => state.setStrategy);
  const view = useRailPlanStore((state) => state.view);
  const setView = useRailPlanStore((state) => state.setView);
  const submitted = useRailPlanStore((state) => state.submitted);
  const planned = useRailPlanStore((state) => state.planned);
  const buildPlan = useRailPlanStore((state) => state.buildPlan);
  const stage = useRailPlanStore((state) => state.stage);
  const locked = useRailPlanStore((state) => state.locked);
  const overrides = useRailPlanStore((state) => state.overrides);
  const lastRepair = useRailPlanStore((state) => state.lastRepair);
  const applyAllSuggestions = useRailPlanStore((state) => state.applyAllSuggestions);
  const clearSuggestions = useRailPlanStore((state) => state.clearSuggestions);
  const selectViolation = useRailPlanStore((state) => state.selectViolation);

  const requestedConflicts = useMemo(
    () => summariseConflicts(submitted?.violations ?? []),
    [submitted],
  );

  const busy = stage !== "idle";
  const pinnedCount = Object.keys(locked).length;
  const appliedCount = Object.keys(overrides).length;
  const profile = strategyList.find((item) => item.id === strategy) ?? strategyList[0];
  const plannedConflicts = planned?.violations.filter((v) => v.severity === "critical").length ?? 0;

  return (
    <section className="border border-rule bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-3 py-2">
        <h1 className="text-[14px] font-semibold tracking-tight text-ink-900">
          Scheduled maintenance planner
        </h1>

        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="objective" className="text-[11px] uppercase tracking-[0.06em] text-ink-500">
            Objective
          </label>
          <select
            id="objective"
            value={strategy}
            onChange={(event) => setStrategy(event.target.value as StrategyId)}
            disabled={busy}
            className="h-7 rounded-sm border border-rule-strong bg-surface px-2 text-[12px] focus:border-accent disabled:text-ink-400"
          >
            {strategyList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* The three steps. Each is a real place to stand, so each is a control. */}
      <ol className="flex flex-wrap items-stretch border-b border-rule">
        <Step
          index={1}
          label="Requested plan"
          detail={`${requests.length} requests received`}
          state={view === "submitted" ? "current" : "done"}
          onClick={() => setView("submitted")}
        />
        <Step
          index={2}
          label="Conflicts"
          detail={
            requestedConflicts.total
              ? `${requestedConflicts.total} detected across ${requestedConflicts.requestIds.length} requests`
              : "none in the requested times"
          }
          state={
            view === "submitted" ? (requestedConflicts.total ? "current" : "done") : "done"
          }
          tone={requestedConflicts.total ? "alert" : "clear"}
          onClick={() => {
            setView("submitted");
            const first = submitted?.violations[0];
            if (first) selectViolation(first.id);
          }}
        />
        <Step
          index={3}
          label="Optimised schedule"
          detail={
            planned
              ? `${planned.plan.placements.length}/${requests.length} scheduled · ${plannedConflicts} conflicts`
              : "not generated yet"
          }
          state={planned ? (view === "planned" ? "current" : "done") : "todo"}
          tone={planned && plannedConflicts === 0 ? "clear" : undefined}
          onClick={() => (planned ? setView("planned") : buildPlan())}
          last
        />
      </ol>

      {/* What is wrong, in one line, in the planner's vocabulary. */}
      {view === "submitted" && requestedConflicts.total > 0 && (
        <div className="border-b border-rule bg-signal-red-soft px-3 py-2">
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-900">
            <TriangleAlert className="size-3.5 text-signal-red" />
            {requestedConflicts.total} conflicts detected across{" "}
            {requestedConflicts.requestIds.length} requests
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
            {requestedConflicts.byCategory.map((entry) => (
              <span key={entry.profile.id} className="flex items-center gap-1 text-ink-700">
                <span className={cn("size-1.5 rounded-full", categoryTone[entry.profile.id].dot)} />
                {entry.count}{" "}
                {entry.count === 1 ? entry.profile.label.toLowerCase() : entry.profile.plural}
              </span>
            ))}
          </p>
        </div>
      )}

      {view === "submitted" && requestedConflicts.total === 0 && appliedCount > 0 && (
        <p className="border-b border-rule bg-signal-green-soft px-3 py-2 text-[12px] text-ink-700">
          The requested plan now satisfies every rule with {appliedCount} accepted suggestion
          {appliedCount === 1 ? "" : "s"}. Generating the schedule will still plan the night from the
          original requests — pin anything you want the solver to keep.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            onClick={applyAllSuggestions}
            disabled={busy || view !== "submitted" || requestedConflicts.total === 0}
          >
            Apply suggested fixes
          </Button>
          {appliedCount > 0 && (
            <Button size="sm" variant="quiet" onClick={clearSuggestions} disabled={busy}>
              <Undo2 className="size-3.5" />
              Undo {appliedCount}
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={buildPlan} disabled={busy}>
            {busy ? "Working…" : planned ? "Generate again" : "Generate optimal schedule"}
          </Button>
        </div>

        <div className="ml-auto min-w-0 text-[11px] leading-relaxed text-ink-500">
          <p className="truncate">{profile.description}</p>
          {(pinnedCount > 0 || lastRepair.length > 0) && (
            <p className="text-accent">
              {pinnedCount > 0 &&
                `${pinnedCount} placement${pinnedCount > 1 ? "s" : ""} pinned as hard constraints. `}
              {lastRepair.length > 0 &&
                `Last run applied ${lastRepair.length} suggested move${lastRepair.length > 1 ? "s" : ""}.`}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Step({
  index,
  label,
  detail,
  state,
  tone,
  onClick,
  last,
}: {
  index: number;
  label: string;
  detail: string;
  state: "todo" | "current" | "done";
  tone?: "alert" | "clear";
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <li className={cn("min-w-[200px] flex-1", !last && "border-r border-rule")}>
      <button
        type="button"
        onClick={onClick}
        aria-current={state === "current" ? "step" : undefined}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
          state === "current" ? "bg-paper" : "hover:bg-sunk",
        )}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
            state === "current"
              ? "bg-ink-900 text-white"
              : state === "done"
                ? "bg-rule-strong text-ink-900"
                : "border border-rule-strong text-ink-400",
          )}
        >
          {index}
        </span>
        <span className="min-w-0">
          <span
            className={cn(
              "block text-[12px] font-medium",
              state === "todo" ? "text-ink-400" : "text-ink-900",
            )}
          >
            {label}
          </span>
          <span
            className={cn(
              "block truncate text-[11px]",
              tone === "alert"
                ? "text-signal-red"
                : tone === "clear"
                  ? "text-signal-green"
                  : "text-ink-500",
            )}
          >
            {detail}
          </span>
        </span>
        {!last && <ChevronRight className="ml-auto size-3.5 shrink-0 text-ink-400" />}
      </button>
    </li>
  );
}
