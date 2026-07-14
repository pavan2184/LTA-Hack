import { job } from "@/data/scheduleBuilder";
import type { ScheduleVariant } from "@/types/railplan";

export const emergencyBufferSchedule: ScheduleVariant = {
  id: "emergency-buffer",
  name: "Maximum Emergency Buffer",
  description: "Leaves protected open capacity to absorb urgent maintenance.",
  jobs: [
    job("M-001", "00:00"), job("M-017", "01:00"), job("M-010", "02:30"),
    job("M-008", "00:00"), job("M-002", "01:30"), job("M-014", "02:30"),
    job("M-004", "00:00"), job("M-016", "01:00"), job("M-003", "02:30"),
    job("M-011", "00:00"), job("M-005", "01:15"), job("M-015", "02:15"), job("M-020", "03:00"),
    job("M-006", "00:00"), job("M-018", "01:00"), job("M-021", "02:30"),
    job("M-007", "00:00"), job("M-013", "00:45"), job("M-009", "02:15"), job("M-019", "03:15"),
  ],
  metrics: { scheduledJobs: 20, totalJobs: 22, activeConflicts: 0, criticalJobsScheduled: 8, totalCriticalJobs: 8, utilisation: 72, robustness: 96, resourceAvailability: 91, emergencyCapacity: 100, safetyBuffers: 94, flexibility: 97 },
  unscheduledRequestIds: ["M-012", "M-022"],
  explanation: "Reserves a one-hour cross-network emergency response block while protecting all critical work.",
};
