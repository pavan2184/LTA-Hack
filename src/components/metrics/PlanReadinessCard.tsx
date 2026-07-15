"use client";

import { AlertTriangle, CheckCircle2, Clock3, MoveRight, ShieldCheck } from "lucide-react";

import type { ScheduleMetrics } from "@/types/railplan";

interface PlanReadinessCardProps {
  metrics: ScheduleMetrics;
  movedJobs: number;
  unscheduledJobs: number;
}

export function PlanReadinessCard({ metrics, movedJobs, unscheduledJobs }: PlanReadinessCardProps) {
  const criticalReady = metrics.criticalJobsScheduled === metrics.totalCriticalJobs;
  const conflictsClear = metrics.activeConflicts === 0;
  const ready = criticalReady && conflictsClear;
  const reserve = Math.max(0, 100 - metrics.utilisation);
  const rows = [
    {
      label: "Critical work",
      value: `${metrics.criticalJobsScheduled} of ${metrics.totalCriticalJobs} placed`,
      ok: criticalReady,
      icon: ShieldCheck,
    },
    {
      label: "Declared conflicts",
      value: conflictsClear ? "0 declared conflicts" : `${metrics.activeConflicts} declared conflicts`,
      ok: conflictsClear,
      icon: AlertTriangle,
    },
    {
      label: "Plan changes",
      value: `${movedJobs} moved · ${unscheduledJobs} deferred`,
      ok: true,
      icon: MoveRight,
    },
    {
      label: "Window reserve",
      value: `${reserve}% unallocated`,
      ok: reserve >= 10,
      icon: Clock3,
    },
  ];

  return (
    <section className="border-t border-slate-100 p-4" aria-label="Plan release readiness">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-lg p-2 ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {ready ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Release readiness</p>
          <p className="mt-1 text-base font-black text-slate-950">{ready ? "Ready for planner review" : "Needs action before review"}</p>
        </div>
      </div>

      <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="flex items-center gap-3 px-3 py-2.5">
              <Icon className={`size-3.5 shrink-0 ${row.ok ? "text-emerald-600" : "text-amber-600"}`} />
              <span className="text-xs font-semibold text-slate-600">{row.label}</span>
              <span className="ml-auto text-right text-xs font-bold text-slate-900">{row.value}</span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        Simulation indicators · fixture conflicts are not independently validated.
      </p>
    </section>
  );
}
