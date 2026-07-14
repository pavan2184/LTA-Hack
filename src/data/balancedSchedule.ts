import { job } from "@/data/scheduleBuilder";
import type { ScheduleVariant } from "@/types/railplan";

export const balancedSchedule: ScheduleVariant = {
  id: "balanced",
  name: "Balanced",
  description: "High completion with practical buffers and limited schedule movement.",
  jobs: [
    job("M-001", "00:00"), job("M-017", "01:15"), job("M-010", "02:30"),
    job("M-008", "00:00"), job("M-002", "01:45"), job("M-014", "02:30", "moved", "M-014 was moved from 01:00 to 02:30. Team Alpha was assigned to M-008, and the original placement violated the minimum safety buffer. The new slot preserves critical work without displacing another high-priority request."),
    job("M-004", "00:00"), job("M-016", "01:15"), job("M-003", "02:30"),
    job("M-011", "00:00"), job("M-005", "01:15"), job("M-015", "02:15"), job("M-020", "03:00"),
    job("M-006", "00:00"), job("M-018", "01:00"), job("M-021", "02:00"), job("M-012", "03:00"),
    job("M-007", "00:00"), job("M-013", "00:45"), job("M-009", "02:15"), job("M-019", "03:15"),
  ],
  metrics: { scheduledJobs: 21, totalJobs: 22, activeConflicts: 0, criticalJobsScheduled: 8, totalCriticalJobs: 8, utilisation: 87, robustness: 84, resourceAvailability: 88, emergencyCapacity: 76, safetyBuffers: 92, flexibility: 79 },
  unscheduledRequestIds: ["M-022"],
  explanation: "Resolves all six conflicts while scheduling 21 requests and retaining usable contingency buffers.",
};
