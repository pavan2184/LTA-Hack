import type {
  Plan,
  PlanMetrics,
  SolveResult,
  SolveStatus,
  StrategyId,
  Violation,
} from "./railplan";

/** Immutable generated content; publication state is derived from append-only records. */
export interface PlanVersion extends Plan {
  id: string;
  planningNight: string;
  sourceRevision: string;
  inputDigest: string;
  strategy: StrategyId;
  solverVersion: string;
  constraintVersion: string;
  status: SolveStatus;
  objectives: SolveResult["objective"];
  metrics: PlanMetrics;
  validation: { independentlyValidated: boolean; violations: Violation[] };
  createdBy: string;
  createdAt: string;
  publishState: "draft" | "published" | "superseded";
  publishedAt: string | null;
  supersededBy: string | null;
}
export interface PlannerDecision {
  id: string;
  planId: string;
  kind: "note" | "accept" | "reject";
  reason: string;
  createdBy: string;
  createdAt: string;
}
