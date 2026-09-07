import {
  REQUEST_FIELD_KEYS,
  type DraftEvidence,
  type DraftProposal,
  type NullableRequestFields,
  type RequestFieldKey,
} from "@railplan/core/types/ingestions";
import type { RequestCatalogue } from "@railplan/core/types/requests";
import { extractionSchema } from "./schemas";
import { IngestionError } from "./errors";
export const EXTRACTOR_VERSION = "transcript-v1";
const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function contains(quote: string, value: string) {
  return new RegExp(
    `(^|[^a-zA-Z0-9])${escape(value)}(?=$|[^a-zA-Z0-9])`,
    "i",
  ).test(quote);
}
function countSupported(quote: string, n: number, labels: string[]) {
  return labels.some((label) =>
    new RegExp(
      `(?:${escape(label)}\\s*[:=x]\\s*${n}\\b|\\b${n}\\s+${escape(label)}(?:s)?\\b)`,
      "i",
    ).test(quote),
  );
}
function supported(
  field: RequestFieldKey,
  f: NullableRequestFields,
  quotes: string[],
  c: RequestCatalogue,
): boolean {
  const value = f[field];
  if (value === null || !quotes.length) return false;
  const q = quotes.join("\n");
  if (field === "title" || field === "description")
    return (
      typeof value === "string" &&
      value.trim().length > 0 &&
      quotes.some((quote) => quote.includes(value))
    );
  if (field === "planningNight")
    return (
      c.nights.some((n) => n.planningNight === value) &&
      contains(q, String(value))
    );
  if (field === "workClass")
    return c.workClasses.includes(f.workClass!) && contains(q, String(value));
  if (field === "blockIds")
    return (
      !!f.blockIds?.length &&
      new Set(f.blockIds).size === f.blockIds.length &&
      f.blockIds.every(
        (id) => c.blocks.some((b) => b.id === id) && contains(q, id),
      )
    );
  if (field === "equipment")
    return f.equipment!.length === 0
      ? /\b(?:no|zero) equipment\b/i.test(q)
      : new Set(f.equipment!.map((e) => e.equipmentId)).size ===
          f.equipment!.length &&
          f.equipment!.every((e) => {
            const known = c.equipment.find((k) => k.id === e.equipmentId);
            return (
              known &&
              e.units <= known.capacity &&
              countSupported(q, e.units, [known.id, known.name])
            );
          });
  if (field === "workforce")
    return (
      !!f.workforce?.length &&
      new Set(f.workforce.map((w) => w.roleId)).size === f.workforce.length &&
      f.workforce.every((w) => {
        const known = c.roles.find((r) => r.id === w.roleId);
        return known && countSupported(q, w.count, [known.id, known.name]);
      })
    );
  if (field === "durationMinutes")
    return new RegExp(
      `\\b(?:duration\\s*(?::|=|is)?|takes?|lasts?)\\s*${value}\\s*(?:minutes?|mins?)\\b`,
      "i",
    ).test(q);
  const labels = {
    preferredStart: "preferred(?: start)?",
    earliestStart: "earliest(?: start)?",
    latestEnd: "latest(?: end)?",
  } as const;
  const minute = value as number;
  const clock = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return new RegExp(
    `\\b${labels[field as keyof typeof labels]}\\s*(?::|=|is)?\\s*(?:${escape(clock)}|${minute}\\s*(?:minutes?|mins?))(?=$|[^0-9])`,
    "i",
  ).test(q);
}
export function validateExtraction(
  raw: unknown,
  transcript: string,
  c: RequestCatalogue,
): DraftProposal[] {
  const parsed = extractionSchema.safeParse(raw);
  if (!parsed.success) throw new IngestionError("invalid_model_output");
  const retainedQuotes = new Set<string>();
  const allSpans: { start: number; end: number }[] = [];
  const proposals: DraftProposal[] = [];
  for (const draft of parsed.data.drafts) {
    const evidence: DraftEvidence[] = draft.evidence.map((e) => {
      const start = transcript.indexOf(e.quote);
      if (
        start < 0 ||
        e.quote.trim() === transcript.trim() ||
        (e.timestamp !== null &&
          (!e.timestamp ||
            !e.quote.includes(e.timestamp) ||
            !/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?$/.test(e.timestamp)))
      )
        throw new IngestionError("invalid_evidence");
      return { ...e, start, end: start + e.quote.length };
    });
    const fields = { ...draft.fields };
    const confidence = { ...draft.confidence };
    for (const field of REQUEST_FIELD_KEYS)
      if (
        !supported(
          field,
          fields,
          evidence.filter((e) => e.field === field).map((e) => e.quote),
          c,
        )
      ) {
        fields[field] = null;
        confidence[field] = null;
      }
    const night = c.nights.find(
      (n) => n.planningNight === fields.planningNight,
    );
    for (const key of ["preferredStart", "earliestStart", "latestEnd"] as const)
      if (
        fields[key] !== null &&
        night &&
        (fields[key]! < night.startMinute || fields[key]! > night.endMinute)
      ) {
        fields[key] = null;
        confidence[key] = null;
      }
    if (fields.earliestStart !== null && fields.latestEnd !== null) {
      if (fields.latestEnd <= fields.earliestStart) {
        fields.latestEnd = null;
        confidence.latestEnd = null;
      } else if (
        fields.durationMinutes !== null &&
        fields.durationMinutes > fields.latestEnd - fields.earliestStart
      ) {
        fields.durationMinutes = null;
        confidence.durationMinutes = null;
      }
    }
    if (
      fields.preferredStart !== null &&
      ((fields.earliestStart !== null &&
        fields.preferredStart < fields.earliestStart) ||
        (fields.durationMinutes !== null &&
          fields.latestEnd !== null &&
          fields.preferredStart + fields.durationMinutes > fields.latestEnd))
    ) {
      fields.preferredStart = null;
      confidence.preferredStart = null;
    }
    const kept = evidence.filter((e) => fields[e.field] !== null);
    for (const e of kept) {
      retainedQuotes.add(e.quote);
      allSpans.push(e);
    }
    if (REQUEST_FIELD_KEYS.some((k) => fields[k] !== null))
      proposals.push({
        fields,
        confidence,
        missingFields: REQUEST_FIELD_KEYS.filter((k) => fields[k] === null),
        evidence: kept,
      });
  }
  if ([...retainedQuotes].reduce((n, q) => n + q.length, 0) > 2048)
    throw new IngestionError("invalid_evidence");
  // A model cannot bypass transcript nonretention by splitting all source text
  // into multiple individually short excerpts across fields or drafts.
  let coveredUntil = 0;
  for (const span of allSpans.sort((a, b) => a.start - b.start)) {
    if (span.start > coveredUntil) break;
    coveredUntil = Math.max(coveredUntil, span.end);
  }
  if (coveredUntil >= transcript.length)
    throw new IngestionError("invalid_evidence");
  if (!proposals.length) throw new IngestionError("no_proposals");
  return proposals;
}
