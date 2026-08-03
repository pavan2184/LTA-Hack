"use client";

import { Lock, Unlock } from "lucide-react";
import { useMemo } from "react";

import { requestById } from "@/data/requests";
import { teamById } from "@/domain/resources";
import { formatClock } from "@/engine/intervals";
import { ruleCatalogue } from "@/engine/validate";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { CorridorMap } from "@/components/network/CorridorMap";

export function RequestInspector() {
  const selectedRequestId = useRailPlanStore((state) => state.selectedRequestId);
  const result = useRailPlanStore((state) => state.activeResult());
  const locked = useRailPlanStore((state) => state.locked);
  const toggleLock = useRailPlanStore((state) => state.toggleLock);
  const moveRequest = useRailPlanStore((state) => state.moveRequest);
  const applySuggestion = useRailPlanStore((state) => state.applySuggestion);
  const explanationFor = useRailPlanStore((state) => state.explanationFor);
  const alternativesFor = useRailPlanStore((state) => state.alternativesFor);
  const view = useRailPlanStore((state) => state.view);

  const request = selectedRequestId ? requestById[selectedRequestId] : null;

  // `result` is not read inside these callbacks, but it is what makes them
  // return something different: both re-derive from the plan the store holds.
  // Dropping it would leave a stale explanation next to a changed schedule.
  /* eslint-disable react-hooks/exhaustive-deps */
  const explanation = useMemo(
    () => (selectedRequestId ? explanationFor(selectedRequestId) : null),
    [selectedRequestId, result, explanationFor],
  );

  const alternatives = useMemo(
    () => (selectedRequestId ? alternativesFor(selectedRequestId) : null),
    [selectedRequestId, result, alternativesFor],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  if (!request || !result) {
    return (
      <div className="border border-rule bg-surface p-3 text-[12px] text-ink-500">
        Select a request to see where it sits, why, and what else it could do.
      </div>
    );
  }

  const placement = result.plan.placements.find((item) => item.requestId === request.id);
  const deferral = result.plan.deferred.find((item) => item.requestId === request.id);
  const involved = result.violations.filter((violation) => violation.requestIds.includes(request.id));
  const isPinned = Boolean(locked[request.id]);
  const team = teamById[request.teamId];

  return (
    <div className="border border-rule bg-surface">
      <header className="border-b border-rule px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[12px] font-medium text-ink-700">{request.id}</span>
          <div className="flex items-center gap-1.5">
            {request.mandatory && <Tag tone="red">mandatory</Tag>}
            {isPinned && <Tag tone="accent">pinned</Tag>}
          </div>
        </div>
        <h2 className="mt-0.5 text-[14px] font-semibold leading-snug text-ink-900">{request.title}</h2>
        <p className="mt-0.5 text-[12px] text-ink-500">
          {request.workType} &middot; {request.sector} &middot; {request.durationMinutes} min
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-px border-b border-rule bg-rule">
        <Cell label="Requested">
          {formatClock(request.preferredStart)}-{formatClock(request.preferredStart + request.durationMinutes)}
        </Cell>
        <Cell label="Planned">
          {placement
            ? `${formatClock(placement.startMinute)}-${formatClock(placement.endMinute)}`
            : "No slot"}
        </Cell>
        <Cell label="Crew">{team ? `${team.name} (${team.capacity})` : request.teamId}</Cell>
        <Cell label="Change">
          {placement
            ? explanation?.movedMinutes
              ? `${Math.abs(explanation.movedMinutes)} min ${explanation.movedMinutes > 0 ? "later" : "earlier"}`
              : "As requested"
            : "Deferred"}
        </Cell>
      </dl>

      {/* The decision, and the counterfactual behind it. */}
      <section className="border-b border-rule px-3 py-2.5">
        <h3 className="text-[11px] uppercase tracking-[0.06em] text-ink-500">Why this placement</h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-900">
          {explanation?.summary ?? deferral?.reason}
        </p>

        {explanation?.blockers.length ? (
          <div className="mt-2.5 border border-rule bg-paper">
            <p className="border-b border-rule px-2 py-1 text-[11px] text-ink-500">
              What happens at {formatClock(request.preferredStart)}, tested against this plan
            </p>
            <ul className="divide-y divide-rule">
              {explanation.blockers.map((violation) => (
                <li key={violation.id} className="px-2 py-1.5 text-[12px]">
                  <span className="font-medium text-signal-red">
                    {ruleCatalogue[violation.ruleId].label}
                  </span>
                  <span className="text-ink-500">
                    {" "}
                    &mdash; {violation.observed}, needs {violation.required}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <dl className="mt-2.5 grid gap-1">
          {explanation?.facts.map((fact) => (
            <div key={fact.label} className="flex gap-2 text-[11px]">
              <dt className="w-28 shrink-0 text-ink-500">{fact.label}</dt>
              <dd className="min-w-0 font-mono text-ink-700">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {involved.length > 0 && (
        <section className="border-b border-rule px-3 py-2.5">
          <h3 className="text-[11px] uppercase tracking-[0.06em] text-signal-red">
            {involved.length} unresolved {involved.length === 1 ? "violation" : "violations"}
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {involved.map((violation) => (
              <li key={violation.id} className="text-[12px] leading-relaxed text-ink-700">
                <span className="font-medium text-ink-900">{ruleCatalogue[violation.ruleId].label}:</span>{" "}
                {violation.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      <CorridorMap requestId={request.id} />

      {/*
       * Alternatives are the point of the tool, not a disclosure. A planner
       * asked "where else could this go" the moment they opened the request, so
       * the answer is already on screen with its cost beside it.
       */}
      <section className="border-t border-rule px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] uppercase tracking-[0.06em] text-ink-500">
            Alternative slots
          </h3>
          <span className="text-[11px] text-ink-400">ranked by closeness to the request</span>
        </div>

        {alternatives && alternatives.alternatives.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {alternatives.alternatives.map((option) => (
              <li key={option.id}>
                <div className="border border-rule bg-paper px-2 py-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[12px] font-medium text-ink-900">
                      {formatClock(option.startMinute)}-{formatClock(option.endMinute)}
                    </span>
                    <span
                      className={cn(
                        "text-[11px]",
                        option.movementMinutesDelta < 0 ? "text-signal-green" : "text-ink-500",
                      )}
                    >
                      {option.movementMinutesDelta === 0
                        ? "no change in movement"
                        : `${option.movementMinutesDelta > 0 ? "+" : ""}${option.movementMinutesDelta} min movement`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-700">{option.whyItWorks}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-[11px] text-ink-500">{option.impact}</span>
                    <Button
                      size="sm"
                      onClick={() =>
                        view === "submitted"
                          ? applySuggestion(option.requestId, option.startMinute)
                          : moveRequest(option.requestId, option.startMinute)
                      }
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 border border-rule bg-paper p-2 text-[12px] leading-relaxed text-ink-700">
            No other start time validates with the rest of the plan held still.
            {alternatives?.bindingRuleId
              ? ` Every candidate is blocked by ${ruleCatalogue[alternatives.bindingRuleId as keyof typeof ruleCatalogue]?.label ?? alternatives.bindingRuleId}.`
              : ""}
          </p>
        )}

        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
          Every option here was inserted into this plan and re-validated, with everything else held
          still. Options that failed, or that pushed a conflict onto another request, are not listed.
        </p>
      </section>

      <section className="border-t border-rule px-3 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => toggleLock(request.id)} disabled={!placement && !isPinned}>
            {isPinned ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
            {isPinned ? "Unpin" : "Pin this time"}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
          Pinning enters this placement as a hard constraint and solves the rest of the night around it.
          Metrics and violations are recomputed, not carried over.
        </p>
      </section>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-3 py-2">
      <dt className="text-[11px] text-ink-500">{label}</dt>
      <dd className="mt-0.5 font-mono text-[12px] text-ink-900">{children}</dd>
    </div>
  );
}
