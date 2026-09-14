import type { PlanningInstance } from "../domain/instance";
import type {
  DeferredRequest,
  Placement,
  SolveResult,
  StrategyId,
} from "./railplan";
export type ExportFormat = "json" | "csv";
interface SavedRequestLabel {
  title: string;
  sector: string;
  blockIds: string[];
  submissionRevision: number | null;
}
export interface PlanExport {
  exportVersion: 1;
  notice: string;
  assessment: {
    nonOperational: true;
    publicationState: "draft" | "published" | "superseded";
    sourceFreshness: "current" | "stale";
    stale: boolean;
    engineVersionMatch: boolean;
    currentSourceRevision: string;
    warnings: string[];
    publishedAt: string | null;
    supersededBy: string | null;
  };
  provenance: {
    planId: string;
    planningNight: string;
    sourceRevision: string;
    inputDigest: string;
    solverVersion: string;
    constraintVersion: string;
    strategy: StrategyId;
    status: SolveResult["status"];
    independentlyValidated: boolean;
    generatedAt: string;
    createdBy: string;
    solveMs: number;
    candidatesEvaluated: number;
  };
  parameters: {
    planningNight: string;
    basedOnPlanId?: string;
    strategy: StrategyId;
    locked: Placement[];
  };
  placements: (Placement & SavedRequestLabel)[];
  deferrals: (DeferredRequest & SavedRequestLabel)[];
  metrics: SolveResult["metrics"];
  objectives: SolveResult["objective"];
  validation: {
    independentlyValidated: boolean;
    violations: SolveResult["violations"];
  };
  facts: PlanningInstance;
}
