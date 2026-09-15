import type { Priority } from "./railplan";

export type WorkItemState = "open" | "scheduled" | "completed" | "cancelled";
export interface WorkItemFlags {
  overdue: boolean;
  repeated: boolean;
  missingDueDate: boolean;
  missingOwner: boolean;
  awaitingTargetNightReview: boolean;
}
export interface WorkItemEvent {
  id: string;
  kind: "record" | "deferred" | "scheduled" | "removed" | "update" | "complete" | "cancel" | "reopen" | "escalate" | "propose-night";
  night: string | null;
  planId: string | null;
  requestId: string | null;
  actorId: string;
  note: string | null;
  metadata: Record<string, string | number | null>;
  createdAt: string;
}
export interface LinkedWorkSubmission {
  submissionId: string;
  planningNight: string;
  kind: "source" | "carry-forward";
}
interface WorkItemBase {
  id: string;
  title: string;
  sourceNight: string;
  sourceRequestId: string;
  organisationId: string | null;
  dueDate: string | null;
  priority: Priority;
  repeatThreshold: number;
  proposedNight: string | null;
  state: WorkItemState;
  effectiveDeferredNights: string[];
  deferredCount: number;
  flags: WorkItemFlags;
  createdAt: string;
  updatedAt: string;
}
export interface PlannerWorkItem extends WorkItemBase {
  scope: "planner";
  sourcePlanId: string;
  ownerId: string | null;
  version: number;
  /** Current occurrence date for later-night choices; sourceNight retains original history. */
  activeNight?: string | null;
  /** Planner-only audit and linked intake evidence, bounded to the latest 100 events. */
  events?: WorkItemEvent[];
  historyTruncated?: boolean;
  submissions?: LinkedWorkSubmission[];
}
export interface ContractorWorkItem extends WorkItemBase {
  scope: "contractor";
  sourcePlanId?: never;
  ownerId?: never;
  version?: never;
  events?: never;
  historyTruncated?: never;
  submissions?: never;
}
export type WorkItem = PlannerWorkItem | ContractorWorkItem;
export interface WorkItemPage {
  items: WorkItem[];
  nextCursor: string | null;
  today: string;
  owners?: { id: string; isCurrentUser: boolean }[];
  nights: { planningNight: string; startMinute: number; endMinute: number }[];
}
