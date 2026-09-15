import type { PlanVersion } from "@railplan/core/types/plans";
import type {
  Placement,
  SolveResult,
  AlternativeSlot,
  ViolationRuleId,
  StrategyId,
} from "@railplan/core/types/railplan";
import type { PlacementExplanation } from "@railplan/core/engine/explain";

export type PlanSummary = Pick<
  PlanVersion,
  | "id"
  | "planningNight"
  | "sourceRevision"
  | "inputDigest"
  | "strategy"
  | "solverVersion"
  | "constraintVersion"
  | "status"
  | "createdAt"
  | "publishState"
  | "publishedAt"
  | "supersededBy"
>;
export interface PlannerOverview {
  nights: { planningNight: string; startMinute: number; endMinute: number }[];
  planningNight: string | null;
  sourceRevision: string;
  pendingCount: number;
  currentPublication: PlanSummary | null;
  versions: PlanSummary[];
  nextCursor: string | null;
}
export interface PlanParameters {
  planningNight: string;
  strategy: StrategyId;
  locked: Placement[];
}
export interface PreviewBasis {
  planId: string;
  sourceRevision: string;
  solverVersion: string;
  constraintVersion: string;
  inputDigest: string;
}
export interface PlanPreview {
  result: SolveResult;
  basis: PreviewBasis;
  parameters: PlanParameters;
  stale: boolean;
  currentSourceRevision: string;
}
export interface PlanInspection extends PlanPreview {
  operation: "inspect";
  requestId: string;
  explanation: PlacementExplanation;
  alternatives: AlternativeSlot[];
  bindingRuleId: ViolationRuleId | null;
}
export type PlanAnalysis =
  | (PlanPreview & { operation: "preview" })
  | PlanInspection
  | {
      operation: "compare-objectives";
      comparisons: PlanPreview[];
      stale: boolean;
      currentSourceRevision: string;
    };
