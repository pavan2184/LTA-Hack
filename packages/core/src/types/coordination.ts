import type { DeferredRequest, Placement, SolveResult, StrategyId } from "./railplan";

export interface CoordinationChange {
  requestId: string;
  organisationId: string | null;
  submissionRevision: number | null;
  kind: "scheduled" | "deferred" | "removed" | "changed";
  before: Placement | null;
  after: Placement | null;
  beforeDeferral: DeferredRequest | null;
  afterDeferral: DeferredRequest | null;
}
export interface OrganisationConfirmation {
  organisationId: string;
  revision: number;
  status: "pending" | "approved" | "changes-requested";
  confirmedAt?: string;
  note?: string;
}
export interface CoordinationParameters {
  planningNight: string;
  strategy: StrategyId;
  locked: Omit<Placement, "locked">[];
}
export interface CoordinationProposal {
  revision: number;
  sourcePlanId: string;
  sourceRevision: string;
  sourceDigest: string;
  inputDigest: string;
  solverVersion: string;
  constraintVersion: string;
  parameters: CoordinationParameters;
  result: SolveResult;
  resultDigest: string;
  impactDigest: string;
  changes: CoordinationChange[];
  requestRevisions: Record<string, number | null>;
  createdAt: string;
  state: "proposed" | "applied" | "superseded" | "withdrawn";
  appliedPlanId: string | null;
  stale: boolean;
}
export interface CoordinationEvent {
  id: string;
  action: string;
  revision: number;
  actorId: string;
  createdAt: string;
  note: string | null;
  organisationId: string | null;
  confirmedAt: string | null;
}
interface CaseCommon {
  id: string;
  version: number;
  planningNight: string;
  state: "open" | "closed";
  deadline: string | null;
  currentRevision: number;
  viewedRevision: number;
  confirmations: OrganisationConfirmation[];
  changes: CoordinationChange[];
  overdue: boolean;
  createdAt: string;
}
export interface PlannerCoordinationCase extends CaseCommon {
  scope: "planner";
  ownerId: string;
  selectedRequestIds: string[];
  proposals: CoordinationProposal[];
  events: CoordinationEvent[];
}
export interface ContractorCoordinationCase extends CaseCommon {
  scope: "contractor";
  proposalState: CoordinationProposal["state"];
}
export type CoordinationCase = PlannerCoordinationCase | ContractorCoordinationCase;
export interface CoordinationCasePage { cases: CoordinationCase[]; nextCursor: string | null; owners?: { id: string; isCurrentUser: boolean }[] }
export interface CoordinationActionResult { case: CoordinationCase; appliedPlanId?: string }
