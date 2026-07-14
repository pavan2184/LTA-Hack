import { job } from "@/data/scheduleBuilder";
import type { ScheduleVariant } from "@/types/railplan";

export const maxCompletionSchedule: ScheduleVariant = {
  id: "max-completion",
  name: "Maximum Work Completion",
  description: "Packs the engineering window tightly to maximise completed work.",
  jobs: [
    job("M-001", "00:00"), job("M-017", "01:00"), job("M-010", "01:45"),
    job("M-008", "00:00"), job("M-002", "01:30"), job("M-014", "02:15"),
    job("M-004", "00:00"), job("M-016", "01:00"), job("M-003", "02:00"),
    job("M-011", "00:00"), job("M-005", "01:00"), job("M-015", "02:00"), job("M-020", "02:45"),
    job("M-006", "00:00"), job("M-018", "01:00"), job("M-021", "02:00"), job("M-012", "03:00"),
    job("M-007", "00:00"), job("M-013", "00:45"), job("M-009", "02:15"), job("M-022", "03:15"),
  ],
  metrics: { scheduledJobs: 21, totalJobs: 22, activeConflicts: 0, criticalJobsScheduled: 8, totalCriticalJobs: 8, utilisation: 92, robustness: 73, resourceAvailability: 84, emergencyCapacity: 49, safetyBuffers: 74, flexibility: 61 },
  unscheduledRequestIds: ["M-019"],
  explanation: "Uses 92% of available engineering hours, with smaller recovery buffers between jobs.",
};
