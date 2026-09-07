import type { RequestFields } from "./requests";
export const REQUEST_FIELD_KEYS = [
  "planningNight",
  "title",
  "description",
  "workClass",
  "blockIds",
  "durationMinutes",
  "preferredStart",
  "earliestStart",
  "latestEnd",
  "equipment",
  "workforce",
] as const;
export type RequestFieldKey = keyof RequestFields;
export type NullableRequestFields = {
  [K in RequestFieldKey]: RequestFields[K] | null;
};
export type DraftConfidence = Record<RequestFieldKey, number | null>;
export interface DraftEvidence {
  field: RequestFieldKey;
  quote: string;
  start: number;
  end: number;
  timestamp: string | null;
}
export interface DraftProposal {
  fields: NullableRequestFields;
  confidence: DraftConfidence;
  missingFields: RequestFieldKey[];
  evidence: DraftEvidence[];
}
export interface PrivateDraft extends DraftProposal {
  id: string;
  version: number;
  status: "private" | "submitted";
  submittedRequestId: string | null;
  manualFields: RequestFieldKey[];
  ownerId: string;
  organisationId: string | null;
  createdAt: string;
  updatedAt: string;
  model: string;
  extractorVersion: string;
}

export interface PrivateDraftRevision extends DraftProposal {
  version: number;
  manualFields: RequestFieldKey[];
  action: "extract" | "edit" | "submit";
  actorId: string;
  fromStatus: null | "private";
  status: "private" | "submitted";
  reason: string;
  createdAt: string;
  model: string;
  extractorVersion: string;
}
export interface PrivateDraftDetail extends PrivateDraft {
  revisions: PrivateDraftRevision[];
  validationErrors: Record<string, string>;
}
export interface RequestProposalSource {
  draftId: string;
  submittedRevision: number;
  submittedAt: string;
  submittedBy: string;
  fields: RequestFields;
  confidence: DraftConfidence;
  evidence: DraftEvidence[];
  manualFields: RequestFieldKey[];
  model: string;
  extractorVersion: string;
  revisions: PrivateDraftRevision[];
}
