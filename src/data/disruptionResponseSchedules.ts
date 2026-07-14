import { balancedSchedule } from "@/data/balancedSchedule";
import { emergencyRequest } from "@/data/disruptionScenarios";
import { job } from "@/data/scheduleBuilder";
import type { DisruptionResponse, ScheduledJob } from "@/types/railplan";

const emergencyJob: ScheduledJob = {
  requestId: emergencyRequest.id,
  sector: emergencyRequest.sector,
  startTime: "01:30",
  endTime: "02:30",
  originalStartTime: "02:00",
  team: emergencyRequest.team,
  status: "emergency",
  locked: false,
  explanation: "The emergency inspection was brought forward by 30 minutes to fit between protected critical work blocks.",
  alternativeSlots: [],
  movedMinutes: -30,
};

function metrics(robustness: number) {
  return {
    ...balancedSchedule.metrics,
    scheduledJobs: 21,
    activeConflicts: 0,
    utilisation: 85,
    robustness,
    resourceAvailability: robustness + 3,
    emergencyCapacity: Math.max(58, robustness - 12),
    safetyBuffers: Math.min(94, robustness + 8),
    flexibility: Math.max(61, robustness - 5),
  };
}

export const disruptionResponseSchedules: Record<string, DisruptionResponse> = {
  "track-fault": {
    scenarioId: "track-fault",
    schedule: {
      ...balancedSchedule,
      id: "disruption-response",
      name: "Emergency track-fault response",
      jobs: [
        ...balancedSchedule.jobs.filter((item) => item.requestId !== "M-002" && item.requestId !== "M-014"),
        emergencyJob,
        job("M-014", "02:30", "moved", "M-014 remains protected after the emergency inspection. Its 02:30 placement avoids displacing any critical work."),
      ],
      metrics: metrics(79),
      unscheduledRequestIds: ["M-002", "M-022"],
      explanation: "Emergency request accommodated with two jobs moved and one lower-priority request deferred.",
    },
    movedRequestIds: ["M-014", "M-005"],
    deferredRequestIds: ["M-002"],
    impactSummary: ["Emergency request accommodated", "2 jobs moved", "1 low-priority job deferred", "0 critical jobs displaced", "All safety constraints preserved"],
  },
  "engineer-unavailable": {
    scenarioId: "engineer-unavailable",
    schedule: {
      ...balancedSchedule,
      id: "disruption-response",
      name: "Team unavailability response",
      jobs: balancedSchedule.jobs.map((item) => item.requestId === "M-014" ? { ...item, team: "Relief Signalling Crew", status: "moved" as const, explanation: "M-014 was reassigned to the qualified relief signalling crew after Team Alpha became unavailable." } : item),
      metrics: metrics(81),
      explanation: "Qualified coverage was reassigned without moving critical work.",
    },
    movedRequestIds: ["M-014"],
    deferredRequestIds: [],
    impactSummary: ["Qualified replacement team assigned", "1 job reassigned", "0 jobs deferred", "0 critical jobs displaced", "All safety constraints preserved"],
  },
  "work-overrun": {
    scenarioId: "work-overrun",
    schedule: {
      ...balancedSchedule,
      id: "disruption-response",
      name: "Work-overrun response",
      jobs: balancedSchedule.jobs.filter((item) => item.requestId !== "M-002").map((item) => {
        if (item.requestId === "M-008") return { ...item, endTime: "02:15", status: "moved" as const };
        if (item.requestId === "M-014") return { ...item, startTime: "02:30", endTime: "04:00", status: "moved" as const };
        return item;
      }),
      metrics: { ...metrics(76), scheduledJobs: 20, utilisation: 82 },
      unscheduledRequestIds: ["M-002", "M-022"],
      explanation: "The overrun was absorbed by protecting critical work and deferring one lower-priority request.",
    },
    movedRequestIds: ["M-002", "M-014"],
    deferredRequestIds: ["M-002"],
    impactSummary: ["45-minute overrun absorbed", "1 critical job moved", "1 lower-priority job deferred", "0 critical jobs displaced", "Contingency buffer used"],
  },
  "window-shortened": {
    scenarioId: "window-shortened",
    schedule: {
      ...balancedSchedule,
      id: "disruption-response",
      name: "Shortened-window response",
      jobs: balancedSchedule.jobs.filter((item) => item.requestId !== "M-012" && item.requestId !== "M-019").map((item) => item.requestId === "M-010" ? { ...item, startTime: "02:00", endTime: "03:30", status: "moved" as const } : item),
      metrics: { ...metrics(74), scheduledJobs: 19, utilisation: 78 },
      unscheduledRequestIds: ["M-012", "M-019", "M-022"],
      explanation: "All critical work completes before the shortened handback; two low-priority jobs are deferred.",
    },
    movedRequestIds: ["M-010"],
    deferredRequestIds: ["M-012", "M-019"],
    impactSummary: ["03:30 handback protected", "1 job moved", "2 low-priority jobs deferred", "0 critical jobs displaced", "All safety constraints preserved"],
  },
};
