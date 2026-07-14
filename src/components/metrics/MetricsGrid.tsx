import { Activity, CircleAlert, Gauge, ShieldCheck, Wrench } from "lucide-react";

import { MetricCard } from "@/components/metrics/MetricCard";
import type { ScheduleMetrics } from "@/types/railplan";

export function MetricsGrid({ metrics, original }: { metrics: ScheduleMetrics; original: boolean }) {
  return (
    <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-5" aria-label="Schedule summary metrics">
      <MetricCard label="Scheduled work" value={`${metrics.scheduledJobs} / ${metrics.totalJobs}`} detail={original ? "4 await placement" : "+3 jobs scheduled"} icon={Wrench} tone={original ? "neutral" : "success"} />
      <MetricCard label="Active conflicts" value={String(metrics.activeConflicts)} detail={original ? "Planner action required" : "6 resolved"} icon={CircleAlert} tone={metrics.activeConflicts ? "danger" : "success"} />
      <MetricCard label="High-priority jobs" value={`${metrics.criticalJobsScheduled} / ${metrics.totalCriticalJobs}`} detail={original ? "1 critical at risk" : "All critical protected"} icon={ShieldCheck} tone={original ? "neutral" : "success"} />
      <MetricCard label="Engineering-hour utilisation" value={`${metrics.utilisation}%`} detail={original ? "Available capacity remains" : "+13% utilisation"} icon={Gauge} tone="cyan" />
      <MetricCard label="Schedule robustness" value={`${metrics.robustness} / 100`} detail={original ? "Vulnerable to overruns" : `${metrics.robustness >= 90 ? "High resilience" : "+22 resilience"}`} icon={Activity} tone={metrics.robustness >= 80 ? "success" : "neutral"} />
    </section>
  );
}
