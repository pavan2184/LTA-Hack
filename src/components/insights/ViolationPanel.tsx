"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { requestById } from "@railplan/core/data/requests";
import {
  categoryOf,
  headline,
  summariseConflicts,
  type ConflictCategory,
} from "@railplan/core/engine/conflicts";
import { formatClock } from "@railplan/core/engine/intervals";
import { ruleCatalogue } from "@railplan/core/engine/validate";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import type { Violation } from "@railplan/core/types/railplan";

/** One hue per category, matching the timeline segments and the request badges. */
export const categoryTone: Record<ConflictCategory, { text: string; border: string; soft: string; dot: string }> = {
  sector: { text: "text-cf-sector", border: "border-cf-sector", soft: "bg-cf-sector-soft", dot: "bg-cf-sector" },
  engineer: {
    text: "text-cf-engineer",
    border: "border-cf-engineer",
    soft: "bg-cf-engineer-soft",
    dot: "bg-cf-engineer",
  },
  compatibility: {
    text: "text-cf-compatibility",
    border: "border-cf-compatibility",
    soft: "bg-cf-compatibility-soft",
    dot: "bg-cf-compatibility",
  },
  equipment: {
    text: "text-cf-equipment",
    border: "border-cf-equipment",
    soft: "bg-cf-equipment-soft",
    dot: "bg-cf-equipment",
  },
  sequencing: {
    text: "text-cf-sequencing",
    border: "border-cf-sequencing",
    soft: "bg-cf-sequencing-soft",
    dot: "bg-cf-sequencing",
  },
  window: { text: "text-cf-window", border: "border-cf-window", soft: "bg-cf-window-soft", dot: "bg-cf-window" },
};

/**
 * The conflicts, grouped the way a planner triages them.
 *
 * The list answers three questions in order: what kind of problem is this, what
 * exactly collides, and what would fix it. The third is not advice — the
 * recommended move was inserted into this plan and re-validated before it was
 * offered, and its cost is stated in the same breath.
 */
export function ViolationPanel() {
  const selectedViolationId = useRailPlanStore((state) => state.selectedViolationId);
  const selectViolation = useRailPlanStore((state) => state.selectViolation);
  const result = useRailPlanStore((state) => state.activeResult());
  const view = useRailPlanStore((state) => state.view);
  const disruptionImpact = useRailPlanStore((state) => state.disruptionImpact);
  const activeDisruptionId = useRailPlanStore((state) => state.activeDisruptionId);
  const hasReplanned = useRailPlanStore((state) => state.hasReplanned);

  const filter = useRailPlanStore((state) => state.conflictFilter);
  const setFilter = useRailPlanStore((state) => state.setConflictFilter);

  const violations = useMemo(
    () => (activeDisruptionId && !hasReplanned ? disruptionImpact : (result?.violations ?? [])),
    [result, disruptionImpact, activeDisruptionId, hasReplanned],
  );

  const summary = useMemo(() => summariseConflicts(violations), [violations]);

  const visible = useMemo(
    () =>
      violations
        .filter((violation) => filter === "all" || categoryOf(violation.ruleId) === filter)
        .sort((a, b) => b.shortfallMinutes - a.shortfallMinutes || a.id.localeCompare(b.id)),
    [violations, filter],
  );

  if (!result) return null;

  if (!summary.total) {
    return (
      <section className="border border-rule bg-surface">
        <header className="border-b border-rule px-3 py-2">
          <h2 className="text-[13px] font-semibold text-ink-900">Conflicts</h2>
        </header>
        <div className="px-3 py-3">
          <p className="text-[13px] text-signal-green">No conflicts.</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
            All {Object.keys(ruleCatalogue).length} rules were re-run against this plan after solving.
            {result.plan.deferred.length > 0 &&
              ` ${result.plan.deferred.length} requests have no slot; that is a capacity outcome, not a rule breach.`}
          </p>
        </div>
      </section>
    );
  }

  return (
    // Bounded, so twenty-two findings scroll inside the panel rather than
    // stretching the page and pushing the chart they refer to off screen.
    <section className="flex max-h-[560px] min-h-0 flex-col border border-rule bg-surface">
      <header className="border-b border-rule px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-ink-900">Conflicts</h2>
          <span className="text-[12px] text-ink-500">
            {summary.total} across {summary.requestIds.length} requests
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All {summary.total}
          </FilterChip>
          {summary.byCategory.map((entry) => (
            <FilterChip
              key={entry.profile.id}
              active={filter === entry.profile.id}
              tone={entry.profile.id}
              onClick={() => setFilter(filter === entry.profile.id ? "all" : entry.profile.id)}
            >
              {entry.profile.label} {entry.count}
            </FilterChip>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === "submitted" && (
          <p className="border-b border-rule bg-signal-amber-soft px-3 py-2 text-[12px] leading-relaxed text-signal-amber">
            These are derived from the requested times by running every rule. Nobody typed this list.
          </p>
        )}

        <ul>
          {visible.map((violation) => (
            <ConflictRow
              key={violation.id}
              violation={violation}
              selected={selectedViolationId === violation.id}
              onSelect={() => selectViolation(selectedViolationId === violation.id ? null : violation.id)}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ConflictRow({
  violation,
  selected,
  onSelect,
}: {
  violation: Violation;
  selected: boolean;
  onSelect: () => void;
}) {
  const resolutionFor = useRailPlanStore((state) => state.resolutionFor);
  const applySuggestion = useRailPlanStore((state) => state.applySuggestion);
  const moveRequest = useRailPlanStore((state) => state.moveRequest);
  const view = useRailPlanStore((state) => state.view);
  const result = useRailPlanStore((state) => state.activeResult());

  const category = categoryOf(violation.ruleId);
  const tone = categoryTone[category];

  // Only computed for the open row: each recommendation is a search over every
  // candidate start for every request in the conflict, re-validated each time.
  /* eslint-disable react-hooks/exhaustive-deps */
  const resolution = useMemo(
    () => (selected ? resolutionFor(violation.id) : null),
    [selected, violation.id, result, resolutionFor],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const mandatory = violation.requestIds.some((id) => requestById[id]?.mandatory);

  return (
    <li className="border-b border-rule last:border-b-0">
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected}
        aria-expanded={selected}
        className={cn(
          "block w-full border-l-[3px] px-3 py-2 text-left transition-colors",
          tone.border,
          selected ? "bg-accent-soft" : "hover:bg-sunk",
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("text-[12px] font-medium", tone.text)}>
            {ruleCatalogue[violation.ruleId].label}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-ink-500">
            {violation.window
              ? `${formatClock(violation.window.start)}-${formatClock(violation.window.end)}`
              : `${violation.shortfallMinutes} min`}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-900">{headline(violation)}</p>
        <p className="mt-1 text-[11px] text-ink-500">
          {violation.observed} &rarr; needs {violation.required}
          {mandatory && " · involves mandatory work"}
        </p>
      </button>

      {selected && (
        <div className="border-t border-rule bg-paper px-3 py-2">
          <p className="text-[12px] leading-relaxed text-ink-700">{violation.detail}</p>

          {resolution ? (
            <div className="mt-2 border border-rule bg-surface px-2.5 py-2">
              <p className="text-[11px] uppercase tracking-[0.06em] text-ink-500">
                Recommended resolution
              </p>
              <p className="mt-1 text-[13px] font-medium text-ink-900">
                {resolution.headline}{" "}
                <span className="font-normal text-ink-500">
                  (from {formatClock(resolution.fromMinute)})
                </span>
              </p>
              <p className="mt-0.5 text-[12px] text-ink-700">{resolution.impact}</p>
              {resolution.affectedRequestIds.length > 0 && (
                <p className="mt-0.5 text-[11px] text-signal-amber">
                  Knock-on: {resolution.affectedRequestIds.join(", ")}
                </p>
              )}
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    view === "submitted"
                      ? applySuggestion(resolution.requestId, resolution.toMinute)
                      : moveRequest(resolution.requestId, resolution.toMinute)
                  }
                >
                  Apply suggestion
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 border border-rule bg-surface px-2.5 py-2 text-[12px] leading-relaxed text-ink-700">
              No single move clears this one: every start time for both jobs was tried against the rest
              of the plan and each traded this conflict for another. It needs the solver, or a decision
              to defer one of them.
            </p>
          )}

          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">{violation.remedy}</p>
        </div>
      )}
    </li>
  );
}

function FilterChip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone?: ConflictCategory;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[11px] font-medium transition-colors",
        active
          ? "border-ink-900 bg-ink-900 text-white"
          : "border-rule text-ink-500 hover:border-rule-strong hover:text-ink-900",
      )}
    >
      {tone && <span className={cn("size-1.5 rounded-full", categoryTone[tone].dot)} />}
      {children}
    </button>
  );
}
