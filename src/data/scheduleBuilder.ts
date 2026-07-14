import { requestById } from "@/data/requests";
import type { RequestStatus, ScheduledJob } from "@/types/railplan";
import { addMinutesToTime, timeToMinutes } from "@/utils/time";

export function job(
  requestId: string,
  startTime: string,
  status: RequestStatus = "moved",
  explanation?: string,
): ScheduledJob {
  const request = requestById[requestId];
  const movedMinutes = timeToMinutes(startTime) - timeToMinutes(request.preferredStart);
  const endTime = addMinutesToTime(startTime, request.durationMinutes);
  const recommendedStart = startTime;

  return {
    requestId,
    sector: request.sector,
    startTime,
    endTime,
    originalStartTime: request.preferredStart,
    team: request.team,
    status: movedMinutes === 0 && status === "moved" ? "scheduled" : status,
    locked: false,
    movedMinutes,
    explanation:
      explanation ??
      `${request.id} was placed at ${startTime} to avoid track, resource, and safety-buffer conflicts while remaining within its permitted window.`,
    alternativeSlots: [
      {
        id: `${requestId}-a`,
        startTime: recommendedStart,
        endTime,
        label: "Option A",
        impact: "Recommended · No conflicts",
        recommended: true,
      },
      {
        id: `${requestId}-b`,
        startTime: request.preferredStart,
        endTime: addMinutesToTime(request.preferredStart, request.durationMinutes),
        label: "Option B",
        impact: "Closer to requested time · May reduce buffer",
        recommended: false,
      },
      {
        id: `${requestId}-c`,
        startTime: "00:30",
        endTime: addMinutesToTime("00:30", request.durationMinutes),
        label: "Option C",
        impact: "Next engineering night · Lowest utilisation impact",
        recommended: false,
      },
    ],
  };
}
