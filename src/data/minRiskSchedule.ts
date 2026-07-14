import { job } from "@/data/scheduleBuilder";
import type { ScheduleVariant } from "@/types/railplan";

export const minRiskSchedule: ScheduleVariant = {
  id: "min-risk",
  name: "Minimum Operational Risk",
  description: "Creates larger safety and resource buffers around critical work.",
  jobs: [
    job("M-001", "00:00"), job("M-017", "01:15"), job("M-010", "02:30"),
    job("M-008", "00:00"), job("M-002", "01:45"), job("M-014", "02:30"),
    job("M-004", "00:00"), job("M-016", "01:15"), job("M-003", "02:30"),
    job("M-011", "00:00"), job("M-005", "01:15"), job("M-015", "02:15"), job("M-020", "03:00"),
    job("M-006", "00:00"), job("M-018", "01:00"), job("M-021", "02:00"), job("M-012", "03:00"),
    job("M-007", "00:00"), job("M-013", "01:00"), job("M-009", "02:45"),
  ],
  metrics: { scheduledJobs: 20, totalJobs: 22, activeConflicts: 0, criticalJobsScheduled: 8, totalCriticalJobs: 8, utilisation: 78, robustness: 93, resourceAvailability: 94, emergencyCapacity: 86, safetyBuffers: 98, flexibility: 91 },
  unscheduledRequestIds: ["M-019", "M-022"],
  explanation: "Protects every critical request with longer handback and resource recovery buffers.",
};
