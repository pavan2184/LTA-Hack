import { CircleAlert, Gauge, ShieldCheck, Wrench } from "lucide-react";

import { MetricCard } from "@/components/metrics/MetricCard";
import type { ScheduleMetrics } from "@/types/railplan";

export function MetricsGrid({ metrics }: { metrics: ScheduleMetrics }) {
  const unplaced = metrics.totalJobs - metrics.scheduledJobs;
  const criticalUnplaced = metrics.totalCriticalJobs - metrics.criticalJobsScheduled;
  const reserve = Math.max(0, 100 - metrics.utilisation);

  return (
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Schedule summary metrics">
      <MetricCard label="Jobs placed" value={`${metrics.scheduledJobs} / ${metrics.totalJobs}`} detail={unplaced ? `${unplaced} still need a slot` : "All work placed"} icon={Wrench} tone={unplaced ? "neutral" : "success"} />
      <MetricCard label="Critical work" value={`${metrics.criticalJobsScheduled} / ${metrics.totalCriticalJobs}`} detail={criticalUnplaced ? `${criticalUnplaced} critical job not placed` : "All critical work placed"} icon={ShieldCheck} tone={criticalUnplaced ? "danger" : "success"} />
      <MetricCard label="Declared conflicts" value={String(metrics.activeConflicts)} detail={metrics.activeConflicts ? "Planner action required" : "None declared in this fixture"} icon={CircleAlert} tone={metrics.activeConflicts ? "danger" : "success"} />
      <MetricCard label="Window load" value={`${metrics.utilisation}%`} detail={`${reserve}% window capacity remains`} icon={Gauge} tone="cyan" />
    </section>
  );
}
