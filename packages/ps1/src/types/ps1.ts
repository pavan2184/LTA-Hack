/**
 * NebulaX PS1 — railway track access optimisation.
 *
 * The unit of scheduling here is a *week*, not a minute. An activity consumes
 * whole access-nights, and `access_night` is an accounting index within a
 * contract's weekly allocation (1..cap) rather than a time of day. That is the
 * single biggest departure from RailPlan's own engine, which places work inside
 * one night at minute resolution.
 */

/** `Live` cuts traction power, so its closure mirrors and crosses lines. */
export type NatureOfWorks = "Live" | "Non-live (Consist)" | "Non-live (Others)";

/** `PM` takes a location alone; `PC` may host co-workers; `C` is a co-worker. */
export type AccessType = "PM" | "PC" | "C";

export type Bound = "EB" | "WB";
export type LocationKind = "tunnel sector" | "platform sector";
export type Scenario = "A" | "B" | "C";

export interface Line {
  lineCode: string;
  lineName: string;
}

export interface Station {
  stationId: string;
  lineCode: string;
  /** Position along its own line, 1-based. */
  seq: number;
  isInterchange: boolean;
}

export interface Sector {
  sectorId: string;
  lineCode: string;
  fromStationId: string;
  toStationId: string;
  seq: number;
  isShared: boolean;
}

/** A bookable place: one tunnel sector or one platform, on one bound. */
export interface LocationSupply {
  locationId: string;
  locationKind: LocationKind;
  lineCode: string;
  bound: Bound;
  /** Activities that may occupy this location in one week. */
  supplyCapacity: number;
}

export interface BufferRule {
  natureOfWorks: NatureOfWorks;
  /** Sectors of exclusion either side of the worksite. */
  upToBufferSectors: number;
  /** `Live` only: the closure mirrors onto the opposite bound. */
  oppositeBoundRequired: boolean;
}

export interface Contract {
  contractNumber: string;
  contractDescription: string;
  contractAwardDate: string;
  activityType: string;
  natureOfActivity: NatureOfWorks;
  /** 1 High, 2 Default, 3 Low. Sets the overrun penalty band. */
  contractPriority: 1 | 2 | 3;
  contractCompletionDate: string;
  /** The date overrun is measured against. */
  plannedCompletionDate: string;
  /** Concurrent activities this contract can run on one night. */
  numberOfWorkfronts: number;
  accessType: AccessType;
  /** Distinct access-nights this contract may use in any one week. */
  numberOfMaximumAccessPerWeek: number;
}

export interface Activity {
  activityId: string;
  contractNumber: string;
  activityType: string;
  /** Inclusive span endpoints; the work books everything between them. */
  startLocationId: string;
  endLocationId: string;
  /** Access-nights of work. A standard night yields 1.0, an ECLO night 1.5. */
  totalAccesses: number;
  plannedStartDate: string;
  predecessorActivityId: string | null;
  /** Nudges the penalty within its contract's band; never across bands. */
  activityPriority: 1 | 2 | 3;
}

export interface Parameters {
  /** Monday of week 1. */
  horizonStart: string;
  horizonWeeks: number;
}

export interface Ps1Instance {
  lines: Line[];
  stations: Station[];
  sectors: Sector[];
  locationSupply: LocationSupply[];
  bufferRules: BufferRule[];
  parameters: Parameters;
  contracts: Contract[];
  activities: Activity[];
}

/** One row of `SCHEDULE_ACCESS.csv`. */
export interface AccessRow {
  activityId: string;
  /** 1-based sequence of this access within its activity. */
  accessSeq: number;
  week: number;
  /** 0 standard, 1 early-closure/late-opening. */
  eclo: 0 | 1;
  /** Which of the contract+type's granted weekly nights this falls on. */
  accessNight: number;
}

/** One row of `SCHEDULE_OCCUPANCY.csv`. */
export interface OccupancyRow {
  activityId: string;
  week: number;
  locationId: string;
  /** Label identifying which possession slot at that location/week. */
  coShareGroup: string;
}

/** One row of `RESULTS.csv`. */
export interface ResultRow {
  scenario: Scenario;
  contractNumber: string;
  simulatedCompletionDate: string;
  overrunDays: number;
}

export interface Submission {
  scenario: Scenario;
  access: AccessRow[];
  occupancy: OccupancyRow[];
  results: ResultRow[];
}

export type ViolationRule =
  | "workload"
  | "start_date"
  | "predecessor"
  | "closure"
  | "capacity"
  | "mix"
  | "weekly_allocation"
  | "workfront"
  | "eclo"
  | "eclo_window"
  | "planned_date"
  | "schema";

export interface HardViolation {
  rule: ViolationRule;
  severity: "hard";
  /** Human-readable pinpoint: activity, week, location. */
  detail: string;
}

export interface SoftScores {
  scenario: Scenario;
  overrunDaysTotal: number;
  contractsOverrunning: number;
  earlinessDaysTotal: number;
  excessAccessNightsTotal: number;
  ecloNightsTotal: number;
  /** Raw overrun-days by contract priority tier. Ignores activity priority. */
  priorityOverrun: Record<"1" | "2" | "3", number>;
  /** contract_weight x (1 + activity nudge) x overrun_days, summed. */
  priorityWeightedScore: number;
}

export interface ValidationReport {
  scenario: Scenario;
  feasible: boolean;
  hardViolations: HardViolation[];
  softScores: SoftScores;
  detail: {
    capacityHotspots: string[];
    nightsScheduled: number;
    ecloNights: number;
  };
  /** The local checker cannot infer a physical night across separate possessions. */
  conformance: {
    mode: "local";
    /** Weekly closures and transitive co-sharing are enforced locally. */
    closureModelVersion: "ps1-closure-v1";
    undecidableRules: readonly ["cross_possession_night_alignment"];
  };
  /** Present only when feasible, per the brief's output contract. */
  objectiveScore?: number;
  formulaVersion?: string;
}

export type SolveStatus = "FEASIBLE" | "INFEASIBLE" | "INVALID_INSTANCE";

export interface SolveDiagnostics {
  startsTried: number;
  candidatesEvaluated: number;
  elapsedMs: number;
  warnings: string[];
  rejectedPins: { activityId: string; week: number; eclo?: 0 | 1; reason: string }[];
  /** Native proof scope is the encoded local model, not the reference validator. */
  solver?: {
    engine: "OR-Tools CP-SAT";
    version?: string;
    status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN";
    scope: "full-local-model";
    workers: number;
    searchSeconds: number;
    bestBound: number | null;
    absoluteGap: number | null;
    /** (returned score - lower bound) / max(1, abs(returned score)). */
    relativeGap: number | null;
    nativeSolveMs: number | null;
    incumbentSource: "cp-sat" | "heuristic" | "none";
  };
}

export interface SolveOutcome {
  status: SolveStatus;
  submission?: Submission;
  validation?: ValidationReport;
  diagnostics: SolveDiagnostics;
}

export interface PlanDiff {
  scoreBefore: number | null;
  scoreAfter: number | null;
  feasibleBefore: boolean;
  feasibleAfter: boolean;
  movedAccesses: number;
  /** Percentage of the previous access rows retained byte-for-byte. */
  unchangedAccessPercent: number;
  movedActivityIds: string[];
  changedContracts: string[];
  completionChanges: {
    contractNumber: string;
    beforeDate: string | null;
    afterDate: string | null;
    beforeOverrunDays: number | null;
    afterOverrunDays: number | null;
  }[];
  newViolations: HardViolation[];
  resolvedViolations: HardViolation[];
}

export type AttentionSeverity = "blocking" | "critical" | "warning" | "change" | "normal";

export type AttentionKind =
  | "violation"
  | "unscheduled"
  | "p1-risk"
  | "rejected-constraint"
  | "disruption"
  | "capacity"
  | "scenario-lever"
  | "recent-change"
  | "activity";

/** A deterministic, engine-grounded item in the operations attention queue. */
export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  kind: AttentionKind;
  label: string;
  detail: string;
  activityIds: string[];
  contractNumbers: string[];
  locationIds: string[];
  weeks: number[];
}

export interface PlanRevision {
  id: number;
  scenario: Scenario;
  createdAt: string;
  reason: string;
  submission: Submission;
  report: ValidationReport;
  diff: PlanDiff | null;
}

export interface QaAnswer {
  kind:
    | "activity-placement"
    | "contract-overrun"
    | "bottleneck"
    | "scenario-comparison"
    | "change-impact"
    | "scenario-lever"
    | "unsupported";
  text: string;
  facts: string[];
  activityIds: string[];
  locationIds: string[];
}

/** Contract-tier weights for the overrun penalty band. */
export const CONTRACT_WEIGHT: Record<1 | 2 | 3, number> = { 1: 100, 2: 10, 3: 1 };

/** Activity-priority nudge, added on top of the contract weight. */
export const ACTIVITY_NUDGE: Record<1 | 2 | 3, number> = { 1: 0.3, 2: 0.2, 3: 0.0 };

/** An ECLO night yields half a night more work than a standard one. */
export const ECLO_YIELD = 1.5;
export const STANDARD_YIELD = 1.0;

/** Penalty rates from the brief's combined objective. */
export const EXCESS_NIGHT_PENALTY = 7;
export const ECLO_PENALTY = 5;

/** Scenario C tolerates this much capacity excess per location-week. */
export const SCENARIO_C_CAPACITY_ALLOWANCE = 1;

/** Scenario C confines each line's ECLO nights to one span this wide. */
export const ECLO_WINDOW_WEEKS = 2;
