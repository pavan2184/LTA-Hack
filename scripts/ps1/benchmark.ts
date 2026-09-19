/** Reproducible local PS1 quality checks; this is not the organiser's reference validator. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { cpus } from "node:os";

import { solveInstance } from "@railplan/ps1/engine/schedule";
import { validate } from "@railplan/ps1/engine/validate";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { parseSubmission, SUBMISSION_FILES } from "@railplan/ps1/io/submission";
import { writeSubmission } from "@railplan/ps1/io/write";
import type { Scenario, SolveStatus } from "@railplan/ps1/types/ps1";

const sourceRoot = resolve("packages/ps1/src");
const scenarios: Scenario[] = ["A", "B", "C"];
const expectedHeaders: Record<string, string> = {
  "SCHEDULE_ACCESS.csv": "activity_id,access_seq,week,eclo,access_night",
  "SCHEDULE_OCCUPANCY.csv": "activity_id,week,location_id,co_share_group",
  "RESULTS.csv": "scenario,contract_number,simulated_completion_date,overrun_days",
};
const epsilon = 1e-8;

interface Row {
  dataset: string;
  scenario: Scenario;
  inputSha256: string;
  activities: number;
  requestedAccesses: number;
  status: SolveStatus | "ERROR";
  locallyFeasible: boolean;
  hardViolations: number | null;
  objectiveScore: number | null;
  overrunDays: number | null;
  excessAccessNights: number | null;
  ecloNights: number | null;
  fullWorkload: boolean;
  csvRoundTrip: boolean;
  exportSha256: string | null;
  solveMs: number[];
  candidatesEvaluated: number[];
  errors: string[];
}

interface Report {
  schemaVersion: 1;
  generatedAt: string;
  checker: "local";
  solverSourceSha256: string;
  runtime: { node: string; platform: string; arch: string; cpu: string };
  runs: number;
  rows: Row[];
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  }).sort();
}

function quantile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function readBaseline(path: string): Report {
  const data = JSON.parse(readFileSync(path, "utf8")) as Partial<Report>;
  if (data.schemaVersion !== 1 || data.checker !== "local" || !Array.isArray(data.rows)) {
    throw new Error("Comparison file must be a version-1 local PS1 benchmark JSON report.");
  }
  const seen = new Set<string>();
  for (const row of data.rows) {
    if (!row || typeof row.dataset !== "string" || !scenarios.includes(row.scenario)
      || typeof row.inputSha256 !== "string" || typeof row.locallyFeasible !== "boolean"
      || !["FEASIBLE", "INFEASIBLE", "INVALID_INSTANCE", "ERROR"].includes(row.status)
      || (row.hardViolations !== null && (!Number.isInteger(row.hardViolations) || row.hardViolations < 0))
      || typeof row.fullWorkload !== "boolean" || typeof row.csvRoundTrip !== "boolean"
      || !Array.isArray(row.errors) || !Array.isArray(row.solveMs)
      || row.solveMs.some((ms) => !Number.isFinite(ms) || ms < 0)
      || (row.objectiveScore !== null && (!Number.isFinite(row.objectiveScore) || row.objectiveScore < 0))) {
      throw new Error("Comparison file contains a malformed benchmark row.");
    }
    const key = `${row.dataset}/${row.scenario}`;
    if (seen.has(key)) throw new Error(`Comparison file repeats ${key}.`);
    seen.add(key);
  }
  return data as Report;
}

function passed(row: Row): boolean {
  return row.status === "FEASIBLE" && row.locallyFeasible && row.fullWorkload
    && row.csvRoundTrip && row.hardViolations === 0 && row.objectiveScore !== null && row.errors.length === 0;
}

function save(path: string, text: string): void {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), text);
}

function main(): void {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--help") {
      console.log("Usage: node --import tsx scripts/ps1/benchmark.ts [--output path.json] [--compare baseline.json] [--markdown path.md] [--runs 1..20]\nDefaults: one run of public + every synthetic manifest instance, normal solver budget.\nExits nonzero for conformance/workload/export failures, changed comparison inputs or objective regressions. Runtime changes are reported, not gated.");
      return;
    }
    const key = args[index];
    const value = args[++index];
    if (!["--output", "--compare", "--markdown", "--runs"].includes(key) || !value || value.startsWith("--") || options.has(key)) {
      throw new Error(`Unknown, repeated or incomplete option: ${key}. Use --help.`);
    }
    options.set(key, value);
  }
  const runs = Number(options.get("--runs") ?? 1);
  if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error("--runs must be an integer from 1 to 20.");
  const output = options.get("--output");
  const comparison = options.get("--compare");
  const markdownPath = options.get("--markdown");
  const paths = [output, comparison, markdownPath].filter((path): path is string => Boolean(path)).map((path) => resolve(path));
  if (new Set(paths).size !== paths.length) throw new Error("Output, comparison and Markdown paths must be distinct.");
  const baseline = comparison ? readBaseline(comparison) : undefined;
  const manifest = JSON.parse(readFileSync(resolve("packages/ps1/data/synthetic/manifest.json"), "utf8")) as { datasets: { id: string }[] };
  const datasets = [
    { id: "public", dir: resolve("packages/ps1/data/public") },
    ...manifest.datasets.map(({ id }) => ({ id, dir: resolve("packages/ps1/data/synthetic", id) })),
  ];
  const report: Report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    checker: "local",
    solverSourceSha256: hash(JSON.stringify(sourceFiles(sourceRoot).map((path) => [relative(sourceRoot, path), readFileSync(path, "utf8")]))),
    runtime: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model ?? "unknown" },
    runs,
    rows: [],
  };

  for (const dataset of datasets) {
    const files = Object.fromEntries(PS1_FILES.map((name) => [name, readFileSync(resolve(dataset.dir, name), "utf8")]));
    const instance = loadInstance(files);
    const inputSha256 = hash(JSON.stringify(PS1_FILES.map((name) => [name, files[name]])));
    const requestedAccesses = instance.activities.reduce((sum, activity) => sum + activity.totalAccesses, 0);
    for (const scenario of scenarios) {
      const row: Row = {
        dataset: dataset.id, scenario, inputSha256, activities: instance.activities.length, requestedAccesses,
        status: "ERROR", locallyFeasible: false, hardViolations: null, objectiveScore: null,
        overrunDays: null, excessAccessNights: null, ecloNights: null, fullWorkload: false,
        csvRoundTrip: false, exportSha256: null, solveMs: [], candidatesEvaluated: [], errors: [],
      };
      for (let run = 0; run < runs; run += 1) {
        try {
          const started = performance.now();
          const outcome = solveInstance(instance, { scenario });
          row.solveMs.push(Math.round((performance.now() - started) * 100) / 100);
          row.candidatesEvaluated.push(outcome.diagnostics.candidatesEvaluated);
          row.status = outcome.status;
          if (!outcome.submission) throw new Error(`No submission: ${outcome.diagnostics.warnings.join("; ")}`);
          const originalReport = validate(instance, outcome.submission);
          const csv = writeSubmission(outcome.submission);
          if (JSON.stringify(Object.keys(csv).sort()) !== JSON.stringify([...SUBMISSION_FILES].sort())) throw new Error("Export must contain exactly the three official CSV files.");
          for (const [name, text] of Object.entries(csv)) {
            if (text.split(/\r?\n/, 1)[0] !== expectedHeaders[name]) throw new Error(`Incorrect published header in ${name}.`);
          }
          const submission = parseSubmission({ access: csv["SCHEDULE_ACCESS.csv"], occupancy: csv["SCHEDULE_OCCUPANCY.csv"], results: csv["RESULTS.csv"] });
          const checked = validate(instance, submission);
          const digest = hash(JSON.stringify(csv));
          if (row.exportSha256 && row.exportSha256 !== digest) throw new Error("Repeated solves produced different exports.");
          row.exportSha256 = digest;
          row.locallyFeasible = originalReport.feasible && checked.feasible;
          row.hardViolations = checked.hardViolations.length;
          row.objectiveScore = checked.objectiveScore ?? null;
          row.overrunDays = checked.softScores.overrunDaysTotal;
          row.excessAccessNights = checked.softScores.excessAccessNightsTotal;
          row.ecloNights = checked.softScores.ecloNightsTotal;
          const delivered = new Map<string, number>();
          for (const access of submission.access) delivered.set(access.activityId, (delivered.get(access.activityId) ?? 0) + (access.eclo ? 1.5 : 1));
          row.fullWorkload = delivered.size === instance.activities.length && instance.activities.every((activity) => (delivered.get(activity.activityId) ?? 0) >= activity.totalAccesses);
          row.csvRoundTrip = submission.scenario === scenario && submission.results.length === instance.contracts.length
            && submission.results.every((result) => result.scenario === scenario)
            && JSON.stringify(writeSubmission(submission)) === JSON.stringify(csv)
            && originalReport.objectiveScore === checked.objectiveScore;
          if (!row.locallyFeasible) row.errors.push(...checked.hardViolations.map((violation) => `${violation.rule}: ${violation.detail}`));
          if (!row.fullWorkload) row.errors.push("Incomplete or unexpected activity workload.");
          if (!row.csvRoundTrip) row.errors.push("CSV serialization/reparse changed the submission or scenario identity.");
          if (outcome.diagnostics.rejectedPins.length) row.errors.push("Unexpected rejected pins in an unpinned benchmark.");
        } catch (error) {
          row.errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      report.rows.push(row);
      console.log(`${dataset.id.padEnd(27)} ${scenario} ${passed(row) ? "PASS" : "FAIL"} score=${row.objectiveScore ?? "n/a"} p50=${quantile(row.solveMs, 0.5).toFixed(2)}ms`);
    }
  }

  let regressions = 0;
  let improvements = 0;
  const comparisonErrors: string[] = [];
  const beforeRows = new Map(baseline?.rows.map((row) => [`${row.dataset}/${row.scenario}`, row]));
  if (baseline && beforeRows.size !== report.rows.length) comparisonErrors.push("Baseline and current reports contain different dataset/scenario sets.");
  const markdown = [
    "# PS1 local benchmark", "", `Generated: ${report.generatedAt}. ${runs} measured run(s) per scenario; normal solver budget.`, "",
    `Runtime: ${report.runtime.node}, ${report.runtime.platform}/${report.runtime.arch}, ${report.runtime.cpu}.`, "",
    "Local checker only, not the organiser's reference validator. Cross-possession physical-night alignment remains undecidable. These public and synthetic cases do not establish hidden-instance performance or optimality. Runtime is Node solver time excluding file I/O, export and checking; one sample is not a stable latency estimate.", "",
    "| Instance | Policy | Before | After | Change | Complete / local / CSV | Before p50 ms | After p50 ms | After p95 ms |", "| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |",
  ];
  for (const row of report.rows) {
    const key = `${row.dataset}/${row.scenario}`;
    const before = beforeRows.get(key);
    const comparable = before && before.inputSha256 === row.inputSha256;
    if (baseline && !comparable) comparisonErrors.push(`${key}: baseline missing or input bytes changed.`);
    const delta = comparable && before.objectiveScore !== null && row.objectiveScore !== null ? row.objectiveScore - before.objectiveScore : null;
    if (comparable && passed(before) && (!passed(row) || (delta !== null && delta > epsilon))) regressions += 1;
    if (comparable && passed(row) && (!passed(before) || (delta !== null && delta < -epsilon))) improvements += 1;
    const marks = [row.fullWorkload, row.locallyFeasible, row.csvRoundTrip].map((ok) => ok ? "pass" : "FAIL").join(" / ");
    markdown.push(`| ${row.dataset} | ${row.scenario} | ${comparable ? before.objectiveScore ?? "n/a" : "—"} | ${row.objectiveScore ?? "n/a"} | ${delta === null ? "—" : Number(delta.toFixed(8))} | ${marks} | ${comparable ? quantile(before.solveMs, 0.5).toFixed(2) : "—"} | ${quantile(row.solveMs, 0.5).toFixed(2)} | ${quantile(row.solveMs, 0.95).toFixed(2)} |`);
  }
  const failures = report.rows.filter((row) => !passed(row));
  const summary = `${report.rows.length - failures.length}/${report.rows.length} outcomes passed complete workload, local conformance and CSV roundtrip. ${improvements} improved; ${regressions} regressed${baseline ? " versus baseline" : " (no baseline supplied)"}.`;
  markdown.push("", summary, "", ...comparisonErrors, ...failures.flatMap((row) => row.errors.map((error) => `- ${row.dataset}/${row.scenario}: ${error}`)), "");
  if (output) save(output, `${JSON.stringify(report, null, 2)}\n`);
  if (markdownPath) save(markdownPath, markdown.join("\n"));
  console.log(summary);
  comparisonErrors.forEach((error) => console.error(error));
  failures.forEach((row) => console.error(`${row.dataset}/${row.scenario}: ${row.errors.join("; ")}`));
  if (failures.length || regressions || comparisonErrors.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
