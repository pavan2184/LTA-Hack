import { describe, it, expect } from "vitest";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { reviewSubmittedPlan, solve } from "@railplan/core/engine/solve";
import {
  makePlanExport,
  serializePlanExport,
  csvCell,
  parseExportFormat,
  type SavedExportRecord,
} from "@/lib/exports/serialize";
const facts = buildInstanceFromLiterals();
function fixture(infeasible = false): SavedExportRecord {
  const result = infeasible
    ? reviewSubmittedPlan()
    : solve({ strategy: "balanced" });
  return {
    id: "fd8d3e80-c056-4ab2-a6b4-2f76c569b665",
    planningNight: facts.planningNight,
    sourceRevision: "12",
    inputDigest: `sha256:${"a".repeat(64)}`,
    facts,
    parameters: {
      planningNight: facts.planningNight,
      strategy: "balanced",
      locked: [],
    },
    result,
    createdBy: "stored-creator",
    createdAt: "2026-09-07T01:02:03.000Z",
    publishedAt: null,
    supersededBy: null,
    currentSourceRevision: "12",
  };
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (c === "\r" && text[i + 1] === "\n" && !quoted) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else field += c;
  }
  return rows;
}
describe("saved plan export serialization", () => {
  it("exports exact persisted provenance/results and prominently identifies draft prototype status", () => {
    const saved = fixture(),
      document = makePlanExport(saved);
    expect(document.notice).toMatch(/non-operational prototype/i);
    expect(document.assessment).toMatchObject({
      nonOperational: true,
      publicationState: "draft",
      sourceFreshness: "current",
      stale: false,
    });
    expect(document.provenance).toMatchObject({
      planId: saved.id,
      inputDigest: saved.inputDigest,
      sourceRevision: "12",
      generatedAt: saved.createdAt,
      solveMs: saved.result.solveMs,
    });
    expect(document.metrics).toEqual(saved.result.metrics);
    expect(document.objectives).toEqual(saved.result.objective);
    expect(document.validation.violations).toEqual(saved.result.violations);
    expect(
      document.placements.map(({ requestId, startMinute, endMinute }) => ({
        requestId,
        startMinute,
        endMinute,
      })),
    ).toEqual(
      saved.result.plan.placements.map(
        ({ requestId, startMinute, endMinute }) => ({
          requestId,
          startMinute,
          endMinute,
        }),
      ),
    );
    expect(document.deferrals.map((d) => d.reason)).toEqual(
      saved.result.plan.deferred.map((d) => d.reason),
    );
    expect(document.facts).toEqual(saved.facts);
    expect(document.parameters).toEqual(saved.parameters);
  });
  it("keeps infeasible, stale, superseded and older-engine states explicit without changing saved results", () => {
    const saved = fixture(true);
    saved.result.status = "INFEASIBLE";
    saved.result.independentlyValidated = false;
    saved.currentSourceRevision = "13";
    saved.publishedAt = "2026-09-07T02:00:00.000Z";
    saved.supersededBy = "0d2e6d90-a973-4c9d-888c-4395b34ef070";
    saved.result.solverVersion = "old-solver";
    const document = makePlanExport(saved);
    expect(document.assessment).toMatchObject({
      publicationState: "superseded",
      sourceFreshness: "stale",
      stale: true,
      engineVersionMatch: false,
    });
    expect(document.assessment.warnings.join(" ")).toMatch(/infeasible/i);
    expect(document.provenance.independentlyValidated).toBe(false);
    expect(document.provenance.status).toBe("INFEASIBLE");
    expect(document.metrics).toEqual(saved.result.metrics);
    expect(serializePlanExport(document, "csv")).toMatch(/superseded/);
  });
  it("preserves Unicode and CSV delimiters/newlines while preventing every string cell from becoming a formula", () => {
    const saved = fixture();
    saved.facts = structuredClone(saved.facts);
    const id = saved.result.plan.placements[0].requestId;
    saved.facts.requests.find((r) => r.id === id)!.title =
      ' \t=HYPERLINK("bad"), 工程\ninspection';
    saved.result.plan.deferred[0].reason = '\r\n@SUM(1,2), "工程"';
    saved.result.metrics.movement.formula = "=SUM(1,2)";
    const document = makePlanExport(saved),
      json = serializePlanExport(document, "json"),
      csv = serializePlanExport(document, "csv"),
      rows = parseCsv(csv);
    expect(JSON.parse(json).placements[0].title).toBe(
      saved.facts.requests.find((r) => r.id === id)!.title,
    );
    const header = rows[0],
      placement = rows.find((r) => r[0] === "placement" && r[1] === id)!;
    expect(placement[header.indexOf("title")]).toBe(
      "'" + saved.facts.requests.find((r) => r.id === id)!.title,
    );
    const deferred = rows.find((r) => r[0] === "deferral")!;
    expect(deferred[header.indexOf("value")]).toBe(
      "'" + saved.result.plan.deferred[0].reason,
    );
    const metric = rows.find((r) => r[0] === "metric" && r[1] === "movement")!;
    expect(JSON.parse(metric[header.indexOf("details_json")]).formula).toBe(
      "=SUM(1,2)",
    );
    expect(rows.every((row) => row.length === header.length)).toBe(true);
  });
  it.each([
    "=1+1",
    "+SUM(1,2)",
    "-1",
    "@SUM(A1)",
    " \t=1",
    "\r\n+1",
    "\uFEFF@x",
    "\u0000-2",
    "＝1+1",
    " ＋1",
    "\t－1",
    "\uFEFF＠SUM(A1)",
  ])("neutralizes CSV text prefix %j", (value) => {
    expect(parseCsv(`${csvCell(value)}\r\n`)[0][0]).toBe("'" + value);
  });
  it("keeps numeric values numeric and JSON serialization deterministic across object key order", () => {
    expect(csvCell(-1)).toBe('"-1"');
    const saved = fixture();
    const first = serializePlanExport(makePlanExport(saved), "json");
    saved.result.metrics = Object.fromEntries(
      Object.entries(saved.result.metrics).reverse(),
    ) as typeof saved.result.metrics;
    expect(serializePlanExport(makePlanExport(saved), "json")).toBe(first);
    expect(first).not.toMatch(/exportedAt/);
    expect(first.indexOf('"assessment"')).toBeLessThan(
      first.indexOf('"facts"'),
    );
    expect(serializePlanExport(makePlanExport(saved), "csv")).toBe(
      serializePlanExport(makePlanExport(saved), "csv"),
    );
  });
  it("requires exactly one supported bounded format query", () => {
    expect(
      parseExportFormat(new URL("https://example.test/export?format=json")),
    ).toBe("json");
    for (const query of [
      "",
      "?format=pdf",
      "?format=json&format=csv",
      "?format=csv&other=1",
      "?format=" + "x".repeat(600),
    ])
      expect(() =>
        parseExportFormat(new URL("https://example.test/export" + query)),
      ).toThrow();
  });
});
