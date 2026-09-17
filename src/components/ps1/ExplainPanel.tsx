"use client";

import { useMemo, useState } from "react";

import { explainPlacement } from "@railplan/ps1/engine/explain";
import { summariseByCategory } from "@railplan/ps1/engine/categories";
import { computeMetrics, overrunBreakdown, type Metric } from "@railplan/ps1/engine/metrics";
import type { Network } from "@railplan/ps1/engine/network";
import type { Ps1Instance, Submission, ValidationReport } from "@railplan/ps1/types/ps1";

import { ActionNote } from "@/components/ps1/ActionNote";
import { Figure } from "@/components/shared/Figure";

/**
 * Status colour, on the same three-way rule the planner dashboard uses: green
 * when a gate is met, amber when something is being paid for, neutral for a
 * figure that is neither good nor bad on its own.
 */
function scoreTone(metric: Metric): "neutral" | "amber" | "green" {
  if (metric.key === "delivery" || metric.key === "activities-scheduled") {
    return metric.numerator >= metric.denominator ? "green" : "amber";
  }
  if (metric.key === "excess-nights" || metric.key === "eclo") {
    return metric.value > 0 ? "amber" : "green";
  }
  return "neutral";
}

/**
 * The "explain, don't just produce" half of the tool.
 *
 * Three panels, in the order a works controller asks the questions: what did
 * this cost and how was that arithmetic done, what is still broken and what
 * lever fixes it, and why is this particular job not where I asked for it.
 */
export function ExplainPanel({
  instance,
  submission,
  report,
  network,
}: {
  instance: Ps1Instance;
  submission: Submission;
  report: ValidationReport;
  network: Network;
}) {
  const metrics = useMemo(
    () => computeMetrics(instance, submission, report, network),
    [instance, submission, report, network],
  );
  const breakdown = useMemo(() => overrunBreakdown(instance, submission), [instance, submission]);
  const categories = useMemo(
    () => summariseByCategory(report.hardViolations),
    [report.hardViolations],
  );

  const slipped = useMemo(() => {
    return instance.activities
      .map((activity) => explainPlacement(instance, submission, activity.activityId, network)!)
      .filter(Boolean)
      .sort((a, b) => b.weeksSlipped - a.weeksSlipped || a.activityId.localeCompare(b.activityId));
  }, [instance, submission, network]);

  const movedCount = useMemo(
    () => slipped.filter((item) => item.weeksSlipped > 0).length,
    [slipped],
  );

  const [selected, setSelected] = useState<string>(slipped[0]?.activityId ?? "");
  const explanation = slipped.find((item) => item.activityId === selected) ?? slipped[0] ?? null;

  return (
    <div className="mt-6 flex flex-col gap-5">
      <section>
        <h3 className="text-[15px] font-semibold text-ink-900">How the score was reached</h3>
        <p className="mt-1 text-[12px] text-ink-700">
          Every figure can be opened to show the arithmetic that produced it — press{" "}
          <span className="font-mono">fx</span> on any of them.
        </p>
        {/*
          The same control RailPlan puts on every number in the planner
          dashboard. The formulas used to be printed under all eight figures at
          once, which made a wall of arithmetic nobody reads and buried the
          numbers themselves; folded away, the grid reads as a result and still
          answers "where did that come from" in one press.
        */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <Figure
              key={metric.key}
              metric={metric}
              tone={scoreTone(metric)}
              className="rounded-sm"
            />
          ))}
        </div>
      </section>

      {breakdown.length > 0 && (
        <section>
          <h3 className="text-[13px] font-semibold text-ink-900">What the overrun cost</h3>
          <p className="mt-1 text-[12px] text-ink-700">
            The contract tier sets the band; the activity priority only nudges inside it, so a
            lower-tier contract can never cross into a higher band.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-rule text-left text-ink-700">
                  <th scope="col" className="py-1.5 pr-3 font-medium">Contract</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Late activity</th>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Arithmetic</th>
                  <th scope="col" className="py-1.5 font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => (
                  <tr key={row.activityId} className="border-b border-rule/60">
                    <td className="py-1.5 pr-3 text-ink-900">
                      {row.contractNumber}
                      <span className="ml-1 text-ink-400">P{row.contractPriority}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-ink-700">
                      {row.activityId}
                      <span className="ml-1 text-ink-400">p{row.activityPriority}</span>
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-[11px] text-ink-700">{row.formula}</td>
                    <td className="py-1.5 tabular-nums font-semibold text-ink-900">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {categories.length > 0 && (
        <section>
          <h3 className="text-[13px] font-semibold text-ink-900">What is still broken</h3>
          <ul className="mt-3 grid gap-2">
            {categories.map((entry) => (
              <li
                key={entry.category.id}
                className="rounded-md border border-signal-red bg-signal-red-soft p-3"
              >
                <p className="text-[12px] font-semibold text-signal-red">
                  {entry.category.label} — {entry.count}
                </p>
                <p className="mt-1 text-[11px] text-ink-700">{entry.category.description}</p>
                <p className="mt-1 text-[11px] text-ink-900">
                  <span className="font-medium">Lever:</span> {entry.category.lever}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="text-[13px] font-semibold text-ink-900">Why is this job here?</h3>
        <p className="mt-1 text-[12px] text-ink-700">
          Answered by counterfactual: the activity is put back in each earlier week with the rest
          of the schedule held still, and whatever stops it is the reason.
        </p>

        <label className="mt-3 block text-[12px] text-ink-700">
          Activity
          <select
            className="mt-1 block w-full max-w-sm rounded-md border border-rule-strong bg-surface px-2 py-1.5 text-[12px] text-ink-900"
            aria-describedby="ps1-note-explain-pick"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {slipped.map((item) => (
              <option key={item.activityId} value={item.activityId}>
                {item.activityId} — {item.contractNumber}
                {item.weeksSlipped > 0 ? ` (+${item.weeksSlipped} wk)` : " (on plan)"}
              </option>
            ))}
          </select>
        </label>
        <ActionNote id="ps1-note-explain-pick">
          {movedCount === 0
            ? "Every activity started in the week it was planned for, so there is nothing to account for here."
            : `Ordered by how far each activity slipped, so the ${movedCount} that moved ${movedCount === 1 ? "is" : "are"} at the top. The rest started in their planned week.`}
        </ActionNote>

        {explanation && (
          <div className="mt-3 rounded-md border border-rule bg-sunk p-3">
            <p className="text-[12px] text-ink-900">{explanation.summary}</p>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2">
              {explanation.facts.map((fact) => (
                <div key={fact.label} className="flex gap-2">
                  <dt className="text-ink-700">{fact.label}</dt>
                  <dd className="text-ink-900">{fact.value}</dd>
                </div>
              ))}
            </dl>
            {explanation.blockers.length > 0 && (
              <ol className="mt-3 grid gap-1 border-t border-rule pt-2 text-[11px]">
                {explanation.blockers.map((blocker) => (
                  <li key={blocker.week} className="flex gap-2">
                    <span className="w-12 shrink-0 tabular-nums text-ink-700">wk{blocker.week}</span>
                    <span className={blocker.kind === "none" ? "text-ink-400" : "text-ink-900"}>
                      {blocker.detail}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
