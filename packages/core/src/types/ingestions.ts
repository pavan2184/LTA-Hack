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
  status: "private";
  ownerId: string;
  organisationId: string | null;
  createdAt: string;
  updatedAt: string;
  model: string;
  extractorVersion: string;
}
