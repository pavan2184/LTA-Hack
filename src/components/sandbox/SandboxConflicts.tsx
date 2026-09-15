"use client";

import Link from "next/link";

import { ViolationPanel } from "@/components/insights/ViolationPanel";
import { SandboxPageHeading } from "@/components/sandbox/SandboxPageHeading";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import { requestById } from "@railplan/core/data/requests";

export function SandboxConflicts() {
  return (
    <section aria-label="Sandbox conflicts" className="space-y-2.5">
      <SandboxPageHeading
        title="Conflicts"
        description="Review each clash with the rules it breaks, apply validated repairs, and see the work the schedule could not place."
      />
      <ViolationPanel />
      <UnplacedWork />
    </section>
  );
}

/**
 * The other half of a solve result. "No conflicts" is only good news if every
 * job found a slot; the work that did not is the decision the planner still
 * has to make, so it sits directly beneath the conflicts rather than behind a
 * filter on another page.
 */
function UnplacedWork() {
  const result = useRailPlanStore((state) => state.activeResult());
  const view = useRailPlanStore((state) => state.view);
  const selectRequest = useRailPlanStore((state) => state.selectRequest);
  if (!result || view !== "planned") return null;
  const deferred = result.plan.deferred;

  return (
    <section aria-label="Work without a slot" className="border border-rule bg-surface">
      <header className="flex items-baseline justify-between gap-2 border-b border-rule px-3 py-2">
        <h2 className="text-[13px] font-semibold text-ink-900">Work without a slot</h2>
        <span className="text-[12px] text-ink-500">
          {deferred.length} of {result.plan.placements.length + deferred.length} requests
        </span>
      </header>
      {!deferred.length ? (
        <p className="px-3 py-3 text-[13px] text-signal-green">Every request has a slot in this schedule.</p>
      ) : (
        <ul className="divide-y divide-rule">
          {deferred.map((entry) => {
            const request = requestById[entry.requestId];
            return (
              <li key={entry.requestId} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-[12px]">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">
                    <span className="font-mono">{entry.requestId}</span> · {request?.title ?? "Unknown request"}
                    {request?.mandatory && <span className="ml-2 font-medium text-signal-red">mandatory</span>}
                  </p>
                  <p className="mt-0.5 leading-relaxed text-ink-700">{entry.reason}</p>
                </div>
                <Link
                  href="/sandbox/requests"
                  onClick={() => selectRequest(entry.requestId)}
                  className="inline-flex h-7 items-center rounded-sm border border-rule-strong bg-surface px-2.5 text-[12px] font-medium text-ink-900 hover:bg-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Review {entry.requestId}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
