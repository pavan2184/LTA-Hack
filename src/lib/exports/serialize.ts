import { z } from "zod";
import type { PlanningInstance } from "@railplan/core/domain/instance";
import { SOLVER_VERSION } from "@railplan/core/engine/solve";
import { CONSTRAINT_VERSION } from "@railplan/core/engine/validate";
import type { SolveResult } from "@railplan/core/types/railplan";
import type { ExportFormat, PlanExport } from "@railplan/core/types/exports";
import { PlanError } from "@/lib/plans/input";
export interface SavedExportRecord {
  id: string;
  planningNight: string;
  sourceRevision: string;
  inputDigest: string;
  facts: PlanningInstance;
  parameters: PlanExport["parameters"];
  result: SolveResult;
  createdBy: string;
  createdAt: string;
  publishedAt: string | null;
  supersededBy: string | null;
  currentSourceRevision: string;
}
export function parseExportFormat(url: URL): ExportFormat {
  if (
    url.search.length > 128 ||
    [...url.searchParams.keys()].some((key) => key !== "format") ||
    url.searchParams.getAll("format").length !== 1
  )
    throw new PlanError(
      "invalid_request",
      "Specify exactly one export format: json or csv.",
    );
  return z.enum(["json", "csv"]).parse(url.searchParams.get("format"));
}
export function makePlanExport(saved: SavedExportRecord): PlanExport {
  const publicationState = saved.supersededBy
    ? "superseded"
    : saved.publishedAt
      ? "published"
      : "draft";
  const sourceFreshness =
    saved.currentSourceRevision === saved.sourceRevision ? "current" : "stale";
  const engineVersionMatch =
    saved.result.solverVersion === SOLVER_VERSION &&
    saved.result.constraintVersion === CONSTRAINT_VERSION;
  const warnings = [
    "Non-operational prototype: fabricated planning inputs. This export is not an operational instruction or safety approval.",
  ];
  if (publicationState === "draft")
    warnings.push("Draft version: this plan has not been published.");
  if (publicationState === "superseded")
    warnings.push(
      "Superseded version: a later plan has been published for this night.",
    );
  if (sourceFreshness === "stale")
    warnings.push(
      "Stale source: planning inputs changed after this version was generated.",
    );
  if (!engineVersionMatch)
    warnings.push(
      "Stale engine versions: generate a new version with the current solver and constraints.",
    );
  if (saved.result.status === "INFEASIBLE")
    warnings.push(
      "Infeasible saved result: this version is not a feasible schedule.",
    );
  if (!saved.result.independentlyValidated)
    warnings.push("The saved independent-validation result is false.");
  const label = (id: string) => {
    const request = saved.facts.requests.find((r) => r.id === id);
    if (!request)
      throw new PlanError(
        "invalid_plan",
        "Saved plan references are incomplete; this version cannot be exported.",
      );
    return {
      title: request.title,
      sector: request.sector,
      blockIds: [...request.blockIds],
      submissionRevision: request.submissionRevision ?? null,
    };
  };
  return {
    exportVersion: 1,
    notice: warnings[0],
    assessment: {
      nonOperational: true,
      publicationState,
      sourceFreshness,
      stale: sourceFreshness === "stale" || !engineVersionMatch,
      engineVersionMatch,
      currentSourceRevision: saved.currentSourceRevision,
      warnings,
      publishedAt: saved.publishedAt,
      supersededBy: saved.supersededBy,
    },
    provenance: {
      planId: saved.id,
      planningNight: saved.planningNight,
      sourceRevision: saved.sourceRevision,
      inputDigest: saved.inputDigest,
      solverVersion: saved.result.solverVersion,
      constraintVersion: saved.result.constraintVersion,
      strategy: saved.parameters.strategy,
      status: saved.result.status,
      independentlyValidated: saved.result.independentlyValidated,
      generatedAt: saved.createdAt,
      createdBy: saved.createdBy,
      solveMs: saved.result.solveMs,
      candidatesEvaluated: saved.result.candidatesEvaluated,
    },
    parameters: saved.parameters,
    placements: saved.result.plan.placements.map((p) => ({
      ...p,
      ...label(p.requestId),
    })),
    deferrals: saved.result.plan.deferred.map((d) => ({
      ...d,
      ...label(d.requestId),
    })),
    metrics: saved.result.metrics,
    objectives: saved.result.objective,
    validation: {
      independentlyValidated: saved.result.independentlyValidated,
      violations: saved.result.violations,
    },
    facts: saved.facts,
  };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
/** Always quote string cells. Prefix an apostrophe before the original text when
 * spreadsheet-trimmed whitespace/control/BOM would expose a formula marker. */
export function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(canonical(value))
        : String(value);
  if (typeof value === "string") {
    let i = 0;
    while (
      i < text.length &&
      (text.charCodeAt(i) <= 32 ||
        text.charCodeAt(i) === 127 ||
        /\s/u.test(text[i]) ||
        text.charCodeAt(i) === 0xfeff)
    )
      i++;
    if ("=+-@＝＋－＠".includes(text[i] ?? " ")) text = "'" + text;
  }
  return '"' + text.replaceAll('"', '""') + '"';
}
export const CSV_COLUMNS = [
  "record_type",
  "record_id",
  "field",
  "value",
  "unit",
  "request_id",
  "title",
  "sector",
  "team_id",
  "start_minute",
  "end_minute",
  "details_json",
] as const;
export function serializePlanExport(
  document: PlanExport,
  format: ExportFormat,
): string {
  if (format === "json") {
    // Keep the notice/assessment prominent while canonicalizing every nested object.
    const ordered = Object.fromEntries(
      Object.entries(document).map(([key, value]) => [key, canonical(value)]),
    );
    return JSON.stringify(ordered, null, 2) + "\n";
  }
  const rows: unknown[][] = [Array.from(CSV_COLUMNS)];
  const row = (
    values: Partial<Record<(typeof CSV_COLUMNS)[number], unknown>>,
  ) => rows.push(CSV_COLUMNS.map((key) => values[key] ?? null));
  row({
    record_type: "metadata",
    record_id: "notice",
    field: "notice",
    value: document.notice,
  });
  row({
    record_type: "metadata",
    record_id: "exportVersion",
    field: "exportVersion",
    value: document.exportVersion,
  });
  for (const [section, values] of [
    ["assessment", document.assessment],
    ["provenance", document.provenance],
  ] as const) {
    for (const [key, value] of Object.entries(values).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ))
      row({ record_type: "metadata", record_id: section, field: key, value });
  }
  row({
    record_type: "parameters",
    record_id: "parameters",
    details_json: document.parameters,
  });
  for (const p of document.placements)
    row({
      record_type: "placement",
      record_id: p.requestId,
      request_id: p.requestId,
      title: p.title,
      sector: p.sector,
      team_id: p.teamId,
      start_minute: p.startMinute,
      end_minute: p.endMinute,
      details_json: p,
    });
  for (const d of document.deferrals)
    row({
      record_type: "deferral",
      record_id: d.requestId,
      request_id: d.requestId,
      title: d.title,
      sector: d.sector,
      value: d.reason,
      details_json: d,
    });
  for (const [key, metric] of Object.entries(document.metrics).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  ))
    row({
      record_type: "metric",
      record_id: key,
      value: metric.value,
      unit: metric.unit,
      details_json: metric,
    });
  document.objectives.forEach((objective, index) =>
    row({
      record_type: "objective",
      record_id: index,
      field: objective.label,
      value: objective.value,
      unit: objective.unit,
      details_json: objective,
    }),
  );
  document.validation.violations.forEach((violation, index) =>
    row({
      record_type: "validation",
      record_id: index,
      field: violation.ruleId,
      value: violation.detail,
      details_json: violation,
    }),
  );
  row({
    record_type: "facts",
    record_id: "saved_facts",
    details_json: document.facts,
  });
  return (
    rows.map((values) => values.map(csvCell).join(",")).join("\r\n") + "\r\n"
  );
}
