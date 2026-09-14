"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { PlanToolbar } from "@/components/controls/PlanToolbar";
import { SolverBar } from "@/components/layout/SolverBar";
import { Button } from "@/components/ui/button";
import { disruptionById } from "@railplan/core/data/disruptions";
import { PLANNING_NIGHT, requestById, requests, SLOT_MINUTES, WINDOW_END } from "@railplan/core/data/requests";
import { trackBlocks } from "@railplan/core/domain/network";
import { formatClock } from "@railplan/core/engine/intervals";
import { ruleCatalogue } from "@railplan/core/engine/validate";
import { useRailPlanStore } from "@/store/useRailPlanStore";

export const sandboxPages = [
  { id: "overview", label: "Overview", href: "/sandbox" },
  { id: "requests", label: "Requests", href: "/sandbox/requests" },
  { id: "conflicts", label: "Conflicts", href: "/sandbox/conflicts" },
  { id: "schedule", label: "Schedule", href: "/sandbox/schedule" },
  { id: "resources", label: "Resources", href: "/sandbox/resources" },
  { id: "scenarios", label: "Scenarios", href: "/sandbox/scenarios" },
] as const;

export type SandboxPageId = (typeof sandboxPages)[number]["id"];

export function DashboardShell({ children }: { children?: ReactNode }) {
  const loaded = useRailPlanStore((state) => state.loaded);
  const stage = useRailPlanStore((state) => state.stage);

  return (
    <div className="min-h-screen bg-paper">
      <TopBar />
      {loaded ? <Workspace>{children}</Workspace> : <Landing />}
      {stage !== "idle" && <SolveOverlay />}
    </div>
  );
}

function TopBar() {
  const pathname = usePathname() ?? "/sandbox";
  const loaded = useRailPlanStore((state) => state.loaded);
  const reset = useRailPlanStore((state) => state.reset);

  return (
    <header className="sticky top-0 z-40 border-b border-rule-strong bg-surface">
      <div className="mx-auto max-w-[1720px] px-4">
        <div className="flex min-h-11 items-center gap-4 py-1.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="text-[14px] font-semibold tracking-tight text-ink-900">RailPlan</span>
            <span className="truncate text-[11px] text-ink-500">Overnight engineering planning</span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-4 text-[11px] text-ink-500">
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
        <nav
          aria-label="Sandbox pages"
          className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]"
        >
          <div className="flex min-w-max gap-1">
            {sandboxPages.map((page) => {
              const active =
                page.href === "/sandbox"
                  ? pathname === page.href
                  : pathname === page.href || pathname.startsWith(`${page.href}/`);
              return (
                <Link
                  key={page.id}
                  href={page.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-sm border px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    active
                      ? "border-ink-900 bg-ink-900 text-white"
                      : "border-rule-strong bg-surface text-ink-700 hover:bg-sunk"
                  }`}
                >
                  {page.label}
                </Link>
              );
            })}
          </div>
        </nav>
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

function Workspace({ children }: { children?: ReactNode }) {
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

      {children}

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
