import { priorityWeight, type MaintenanceRequest, type StrategyId } from "../types/railplan";

/**
 * A strategy is an objective profile, not a stored schedule.
 *
 * Each profile expresses a planning preference through three deterministic
 * levers: the order requests are considered in, how candidate start times are
 * ranked, and any extra separation or reserve the profile insists on. Two
 * profiles run on the same solver against the same constraints; the difference
 * in their output is entirely explained by the numbers below.
 */
export interface StrategyProfile {
  id: StrategyId;
  label: string;
  description: string;
  /** What this profile is trying to maximise or minimise, in priority order. */
  objectives: string[];
  /** Extra minutes of separation added between jobs on a block while solving. */
  extraBlockBufferMinutes: number;
  /**
   * Whether the profile would rather place a job with no recovery gap than not
   * place it at all. False makes the gap effectively a hard constraint, which
   * is the honest reading of "minimum risk".
   */
  relaxBufferWhenBlocked: boolean;
  /**
   * Minutes held back from the end of the engineering window while solving.
   *
   * Expressed as a reserve rather than an absolute clock time, because a
   * profile is a planning preference and the window belongs to the night being
   * planned. "Keep the last 45 minutes clear" survives a night with a different
   * handback deadline; "stop at 03:15" silently means something else.
   */
  windowReserveMinutes: number;
  /** Lower sorts earlier. Requests are considered in this order. */
  requestRank: (request: MaintenanceRequest) => number;
  /** Lower is preferred. Candidate start times are tried in this order. */
  candidateCost: (request: MaintenanceRequest, start: number) => number;
}

const weight = (request: MaintenanceRequest) => priorityWeight[request.priority];

export const strategyProfiles: Record<StrategyId, StrategyProfile> = {
  balanced: {
    id: "balanced",
    label: "Balanced",
    description:
      "Places the highest-value work first and keeps it near its requested time, while holding a 15-minute recovery gap between jobs on a block.",
    objectives: [
      "1. Place all mandatory work",
      "2. Maximise priority-weighted completion",
      "3. Minimise weighted movement from requested times",
      "4. Hold a 15-minute inter-job recovery gap where the corridor allows",
    ],
    extraBlockBufferMinutes: 15,
    relaxBufferWhenBlocked: true,
    windowReserveMinutes: 0,
    requestRank: (request) => -weight(request) * 1000 - request.durationMinutes,
    candidateCost: (request, start) => Math.abs(start - request.preferredStart),
  },

  "max-completion": {
    id: "max-completion",
    label: "Maximum completion",
    description:
      "Considers work in order of value per minute and packs each block as early as possible, accepting tighter gaps to fit more jobs in.",
    objectives: [
      "1. Place all mandatory work",
      "2. Maximise priority-weighted completion",
      "3. Maximise job count",
      "4. Movement from requested times is not penalised",
    ],
    extraBlockBufferMinutes: 0,
    relaxBufferWhenBlocked: true,
    windowReserveMinutes: 0,
    requestRank: (request) => -(weight(request) / request.durationMinutes) * 1000,
    candidateCost: (_request, start) => start,
  },

  "min-risk": {
    id: "min-risk",
    label: "Minimum risk",
    description:
      "Enforces a 30-minute recovery gap between jobs on a block and finishes work as early as the window allows, so an overrun has somewhere to go.",
    objectives: [
      "1. Place all mandatory work",
      "2. Maximise the minimum recovery gap between jobs",
      "3. Finish earlier to protect the handback",
      "4. Weighted completion is traded for slack",
    ],
    extraBlockBufferMinutes: 30,
    relaxBufferWhenBlocked: false,
    windowReserveMinutes: 0,
    requestRank: (request) => -weight(request) * 1000 - request.durationMinutes,
    candidateCost: (request, start) => start + Math.abs(start - request.preferredStart) * 0.25,
  },

  "min-changes": {
    id: "min-changes",
    label: "Minimum changes",
    description:
      "Considers the requests that are hardest to move first and holds every job as close to its submitted time as the constraints allow.",
    objectives: [
      "1. Place all mandatory work",
      "2. Minimise weighted movement from requested times",
      "3. Minimise the number of jobs that move at all",
      "4. Completion is traded for stability",
    ],
    extraBlockBufferMinutes: 0,
    relaxBufferWhenBlocked: true,
    windowReserveMinutes: 0,
    requestRank: (request) => -weight(request) * 1000 + request.preferredStart,
    candidateCost: (request, start) => Math.abs(start - request.preferredStart) * weight(request),
  },

  "emergency-buffer": {
    id: "emergency-buffer",
    label: "Emergency reserve",
    description:
      "Solves against a handback deadline 45 minutes early, leaving the tail of the window clear so urgent work can be inserted without displacing anything.",
    objectives: [
      "1. Place all mandatory work",
      "2. Keep 03:15-04:00 clear across every corridor",
      "3. Maximise emergency scenarios that fit without moving critical work",
      "4. Completion is traded for reserve",
    ],
    extraBlockBufferMinutes: 0,
    relaxBufferWhenBlocked: true,
    windowReserveMinutes: 45,
    requestRank: (request) => -weight(request) * 1000 - request.durationMinutes,
    candidateCost: (_request, start) => start,
  },
};

export const strategyList: StrategyProfile[] = [
  strategyProfiles.balanced,
  strategyProfiles["max-completion"],
  strategyProfiles["min-risk"],
  strategyProfiles["min-changes"],
  strategyProfiles["emergency-buffer"],
];
