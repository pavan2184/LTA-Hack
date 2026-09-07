import type { WorkClass } from "../domain/resources";

export type Priority = "low" | "medium" | "high" | "critical";

export type StrategyId =
  | "balanced"
  | "max-completion"
  | "min-risk"
  | "min-changes"
  | "emergency-buffer";

/** Weight applied to a request when trading completion against movement. */
export const priorityWeight: Record<Priority, number> = {
  critical: 8,
  high: 4,
  medium: 2,
  low: 1,
};

export interface EquipmentDemand {
  equipmentId: string;
  units: number;
}

export interface MaintenanceRequest {
  id: string;
  title: string;
  shortTitle: string;
  workType: string;
  workClass: WorkClass;
  /** Atomic blocks the work occupies, expanded from its requested sector. */
  blockIds: string[];
  /** Display-only label derived from blockIds. */
  sector: string;
  durationMinutes: number;
  /** Minutes of block occupation after the work ends, before handback. */
  clearanceMinutes: number;
  priority: Priority;
  /** Team the planner requested. The solver keeps it; it does not reassign crews. */
  teamId: string;
  requiredSkills: string[];
  equipment: EquipmentDemand[];
  /** Minutes from midnight. The planning window is 00:00-04:00 => 0-240. */
  preferredStart: number;
  earliestStart: number;
  latestEnd: number;
  /** Critical work must be placed; the solver reports infeasible rather than defer it. */
  mandatory: boolean;
  dependencies: string[];
  /** Minimum gap in minutes between a predecessor ending and this starting. */
  dependencyLagMinutes: number;
  description: string;
}

export interface Placement {
  requestId: string;
  startMinute: number;
  endMinute: number;
  teamId: string;
  /** True when a planner pinned this placement before the solve. */
  locked: boolean;
}

export interface Plan {
  placements: Placement[];
  deferred: DeferredRequest[];
}

export interface DeferredRequest {
  requestId: string;
  /** Rule IDs of the constraints that blocked every candidate start. */
  bindingRuleIds: string[];
  reason: string;
}

export type ViolationRuleId =
  | "BLOCK_CAPACITY"
  | "CONFLICT_ZONE"
  | "ADJACENT_WORK"
  | "TEAM_CAPACITY"
  | "WORKFORCE_CAPACITY"
  | "EQUIPMENT_CAPACITY"
  | "SKILL_COVERAGE"
  | "WORK_COMPATIBILITY"
  | "DEPENDENCY_ORDER"
  | "TIME_WINDOW"
  | "HANDBACK"
  | "TRAVEL_TIME"
  | "SHIFT_AVAILABILITY";

export type Severity = "critical" | "warning";

export interface Violation {
  /** Stable per-plan identity, so the UI can select one and keep it selected. */
  id: string;
  ruleId: ViolationRuleId;
  severity: Severity;
  requestIds: string[];
  /** One-line statement of what is wrong. Generated, never hand-written. */
  title: string;
  /** Full sentence with the observed and required values substituted in. */
  detail: string;
  /** Blocks, zones, teams or equipment the rule was evaluated against. */
  subjects: string[];
  observed: string;
  required: string;
  /** Minutes of overlap, or minutes short of the requirement. */
  shortfallMinutes: number;
  /**
   * The exact minutes in which the rule is broken, so the timeline can shade the
   * offending segment rather than condemning two whole jobs. Null for rules that
   * are not about a span of time at all, e.g. an unqualified crew.
   */
  window: { start: number; end: number } | null;
  remedy: string;
  /** Null counts mean demand is unknown; this is a critical input omission. */
  workforce?: {
    teamId: string;
    roleId: string | null;
    demand: number | null;
    available: number | null;
    shortfall: number | null;
  };
}

export interface MetricValue {
  key: string;
  label: string;
  value: number;
  unit: "count" | "percent" | "minutes";
  numerator: number;
  denominator: number;
  formula: string;
  note: string;
}

export interface PlanMetrics {
  placed: MetricValue;
  weightedCompletion: MetricValue;
  criticalPlaced: MetricValue;
  violations: MetricValue;
  /** Distinct requests named in at least one conflict, not the conflict count. */
  conflictedRequests: MetricValue;
  blockUtilisation: MetricValue;
  teamUtilisation: MetricValue;
  workforceUtilisation: MetricValue;
  workforceShortageIntervals: MetricValue;
  equipmentUtilisation: MetricValue;
  bufferCompliance: MetricValue;
  emergencyCapacity: MetricValue;
  flexibility: MetricValue;
  movement: MetricValue;
}

export type SolveStatus = "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "TIME_LIMIT";

export interface SolveResult {
  status: SolveStatus;
  strategy: StrategyId | "submitted";
  plan: Plan;
  violations: Violation[];
  metrics: PlanMetrics;
  /** Objective vector for the strategy, in lexicographic priority order. */
  objective: { label: string; value: number; unit: string }[];
  /** sha-256-style digest of every input that could change this result. */
  inputHash: string;
  constraintVersion: string;
  solverVersion: string;
  solveMs: number;
  /** Candidate starts examined. Shown so "it computed something" is checkable. */
  candidatesEvaluated: number;
  /** True when an independent validation pass found zero critical violations. */
  independentlyValidated: boolean;
}

export interface AlternativeSlot {
  id: string;
  requestId: string;
  startMinute: number;
  endMinute: number;
  feasible: boolean;
  /** Requests that had to move for this alternative to fit. */
  displacedRequestIds: string[];
  movementMinutesDelta: number;
  weightedCompletionDelta: number;
  /** The rule that prevents an even closer placement to the requested time. */
  bindingRuleId: ViolationRuleId | null;
  summary: string;
  /** What the validator confirmed is free at this start. */
  whyItWorks: string;
  /** What it costs: movement, and who else has to change. */
  impact: string;
}

export interface DisruptionScenario {
  id: string;
  title: string;
  description: string;
  kind: "block-closure" | "team-unavailable" | "overrun" | "window-shortened";
  /** Blocks taken out of use, for a block closure. */
  blockIds?: string[];
  teamId?: string;
  requestId?: string;
  overrunMinutes?: number;
  /** New handback deadline, for a shortened window. */
  windowEnd?: number;
  fromMinute: number;
  toMinute: number;
  /** Emergency work that must be inserted, for a block closure. */
  insertRequestId?: string;
}
