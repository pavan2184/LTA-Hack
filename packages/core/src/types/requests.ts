import type { RequestProposalSource } from "./ingestions";
import type { WorkClass } from "../domain/resources";
import type { EquipmentDemand, Priority } from "./railplan";
export type RequestStatus =
  | "draft"
  | "submitted"
  | "needs_info"
  | "approved"
  | "rejected"
  | "cancelled";
export interface RequestFields {
  planningNight: string;
  title: string;
  description: string;
  workClass: WorkClass;
  blockIds: string[];
  durationMinutes: number;
  preferredStart: number;
  earliestStart: number;
  latestEnd: number;
  equipment: EquipmentDemand[];
  workforce: {
    roleId: string;
    count: number;
  }[];
}
export interface RequestApproval {
  teamId: string;
  priority: Priority;
  clearanceMinutes: number;
  requiredSkills: string[];
  dependencies: string[];
  dependencyLagMinutes: number;
  safetyConfirmed: true;
}
export interface RequestEvent {
  version: number;
  action: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  actorId: string;
  reason: string;
  createdAt: string;
}
export interface RequestRevision {
  version: number;
  status: RequestStatus;
  fields: RequestFields;
  approval: RequestApproval | null;
  createdAt: string;
}
export interface RequestSubmission {
  /** Included on detail reads; omitted from lightweight lists. */
  proposalSource?: RequestProposalSource | null;
  id: string;
  organisationId: string;
  organisationName: string;
  version: number;
  status: RequestStatus;
  fields: RequestFields;
  approval: RequestApproval | null;
  activeApprovedRevision: number | null;
  scheduled: null | {
    planId: string;
    revision: number;
    startMinute: number;
    endMinute: number;
  };
  history: RequestEvent[];
  revisions: RequestRevision[];
  createdAt: string;
  updatedAt: string;
}
export interface RequestCatalogue {
  organisations?: { id: string; name: string }[];
  nights: {
    planningNight: string;
    startMinute: number;
    endMinute: number;
    slotMinutes: number;
  }[];
  blocks: {
    id: string;
    label: string;
  }[];
  workClasses: WorkClass[];
  equipment: {
    id: string;
    name: string;
    capacity: number;
  }[];
  roles: {
    id: string;
    name: string;
  }[];
  teams?: {
    id: string;
    name: string;
    skills: string[];
  }[];
  dependencies?: {
    id: string;
    title: string;
    planningNight: string;
  }[];
}
