import { job } from "@/data/scheduleBuilder";
import type { ScheduleVariant } from "@/types/railplan";

export const minChangesSchedule: ScheduleVariant = {
  id: "min-changes",
  name: "Minimum Schedule Changes",
  description: "Keeps work near requested times and defers lower-priority jobs where needed.",
  jobs: [
    job("M-001", "00:00"), job("M-017", "01:00"), job("M-010", "02:00"),
    job("M-008", "00:00"), job("M-014", "01:30"), job("M-002", "03:00"),
    job("M-004", "00:00"), job("M-016", "01:00"), job("M-003", "02:00"),
    job("M-011", "00:00"), job("M-005", "01:15"), job("M-015", "02:15"), job("M-020", "03:00"),
    job("M-006", "00:45"), job("M-018", "01:45"), job("M-021", "03:00"),
    job("M-007", "00:00"), job("M-013", "00:45"), job("M-009", "02:15"), job("M-019", "03:15"),
  ],
  metrics: { scheduledJobs: 20, totalJobs: 22, activeConflicts: 0, criticalJobsScheduled: 8, totalCriticalJobs: 8, utilisation: 81, robustness: 80, resourceAvailability: 85, emergencyCapacity: 67, safetyBuffers: 83, flexibility: 77 },
  unscheduledRequestIds: ["M-012", "M-022"],
  explanation: "Moves only the requests involved in constraint violations and preserves most submitted placements.",
};
