import { Activity, CircleAlert, Gauge, Wrench } from "lucide-react";

import { MetricCard } from "@/components/metrics/MetricCard";
import type { ScheduleMetrics } from "@/types/railplan";

export function MetricsGrid({ metrics, original }: { metrics: ScheduleMetrics; original: boolean }) {
  return (
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Schedule summary metrics">
      <MetricCard label="Scheduled work" value={`${metrics.scheduledJobs} / ${metrics.totalJobs}`} detail={original ? "4 await placement" : "+3 jobs scheduled"} icon={Wrench} tone={original ? "neutral" : "success"} />
      <MetricCard label="Active conflicts" value={String(metrics.activeConflicts)} detail={original ? "Planner action required" : "6 resolved"} icon={CircleAlert} tone={metrics.activeConflicts ? "danger" : "success"} />
      <MetricCard label="Engineering utilisation" value={`${metrics.utilisation}%`} detail={original ? "Capacity remains" : "+13% after optimisation"} icon={Gauge} tone="cyan" />
      <MetricCard label="Plan robustness" value={`${metrics.robustness} / 100`} detail={original ? "Sensitive to overruns" : `${metrics.robustness >= 90 ? "High resilience" : "+22 resilience"}`} icon={Activity} tone={metrics.robustness >= 80 ? "success" : "neutral"} />
    </section>
  );
}
