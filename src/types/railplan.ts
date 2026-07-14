export type Priority = "low" | "medium" | "high" | "critical";

export type RequestStatus =
  | "scheduled"
  | "conflicted"
  | "unscheduled"
  | "locked"
  | "moved"
  | "emergency";

export type StrategyId =
  | "balanced"
  | "max-completion"
  | "min-risk"
  | "min-changes"
  | "emergency-buffer";

export interface MaintenanceRequest {
  id: string;
  title: string;
  shortTitle: string;
  workType: string;
  sector: string;
  durationMinutes: number;
  priority: Priority;
  team: string;
  equipment: string[];
  preferredStart: string;
  earliestStart: string;
  latestEnd: string;
  status: RequestStatus;
  conflictIds: string[];
  dependencies: string[];
  description: string;
}

export interface AlternativeSlot {
  id: string;
  startTime: string;
  endTime: string;
  label: string;
  impact: string;
  recommended: boolean;
}

export interface ScheduledJob {
  requestId: string;
  sector: string;
  startTime: string;
  endTime: string;
  originalStartTime: string;
  team: string;
  status: RequestStatus;
  locked: boolean;
  explanation: string;
  alternativeSlots: AlternativeSlot[];
  movedMinutes?: number;
}

export interface Conflict {
  id: string;
  type:
    | "track"
    | "team"
    | "equipment"
    | "safety-buffer"
    | "dependency"
    | "time-window";
  requestIds: string[];
  title: string;
  explanation: string;
  severity: "warning" | "critical";
}

export interface ScheduleMetrics {
  scheduledJobs: number;
  totalJobs: number;
  activeConflicts: number;
  criticalJobsScheduled: number;
  totalCriticalJobs: number;
  utilisation: number;
  robustness: number;
  resourceAvailability: number;
  emergencyCapacity: number;
  safetyBuffers: number;
  flexibility: number;
}

export interface ScheduleVariant {
  id: StrategyId | "original" | "disruption-response";
  name: string;
  description: string;
  jobs: ScheduledJob[];
  metrics: ScheduleMetrics;
  unscheduledRequestIds: string[];
  explanation: string;
}

export interface DisruptionScenario {
  id: string;
  title: string;
  description: string;
  icon: "track" | "team" | "overrun" | "window";
  sector?: string;
  team?: string;
  requestId?: string;
  startTime: string;
  endTime: string;
  affectedRequestIds: string[];
  degradedRobustness: number;
  warning: string;
}

export interface DisruptionResponse {
  scenarioId: string;
  schedule: ScheduleVariant;
  movedRequestIds: string[];
  deferredRequestIds: string[];
  impactSummary: string[];
}
