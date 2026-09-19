/**
 * Produce the public test results: one feasible submission per scenario,
 * written to `packages/ps1/data/results/<scenario>/`, with a validation report
 * for each. This is deliverable 1 of the brief — pre-computed output for the
 * provided dataset, proving the solver works on known data.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { writeSubmission } from "@railplan/ps1/io/write";
import { zipArchive } from "@railplan/ps1/io/zip";
import { solveInstance } from "@railplan/ps1/engine/schedule";
import { validate } from "@railplan/ps1/engine/validate";
import type { Scenario, Submission } from "@railplan/ps1/types/ps1";

const dataDir = resolve("packages/ps1/data/public");
const outRoot = resolve("packages/ps1/data/results");

const instance = loadInstance(
  Object.fromEntries(PS1_FILES.map((name) => [name, readFileSync(resolve(dataDir, name), "utf8")])),
);

const summary: Record<string, unknown>[] = [];
let failed = false;
const candidates: Submission[] = [];
const outputs: { scenario: Scenario; submission: Submission; report: ReturnType<typeof validate> }[] = [];

for (const scenario of ["A", "B", "C"] as Scenario[]) {
  const started = performance.now();
  const outcome = solveInstance(instance, { scenario, initialCandidates: candidates });
  const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
  if (outcome.status !== "FEASIBLE" || !outcome.submission) {
    console.error(`Scenario ${scenario}: ${outcome.status}`, outcome.diagnostics.warnings);
    failed = true;
    continue;
  }
  const submission = outcome.submission;
  const report = validate(instance, submission);
  if (!report.feasible) failed = true;
  else candidates.push(submission);
  outputs.push({ scenario, submission, report });
  summary.push({
    scenario,
    feasible: report.feasible,
    hardViolations: report.hardViolations.length,
    objectiveScore: report.objectiveScore ?? null,
    overrunDaysTotal: report.softScores.overrunDaysTotal,
    excessAccessNightsTotal: report.softScores.excessAccessNightsTotal,
    ecloNightsTotal: report.softScores.ecloNightsTotal,
    nightsScheduled: report.detail.nightsScheduled,
    solveMs: elapsedMs,
  });
}

console.table(summary);
if (failed) {
  console.error("At least one scenario is infeasible; existing public results were not replaced.");
  process.exit(1);
}

const officialFiles: Record<string, string> = {};
for (const { scenario, submission, report } of outputs) {
  const dir = resolve(outRoot, scenario);
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(writeSubmission(submission))) {
    writeFileSync(resolve(dir, name), text);
    officialFiles[`${scenario}/${name}`] = text;
  }
  writeFileSync(resolve(dir, "VALIDATION.json"), `${JSON.stringify(report, null, 2)}\n`);
}
writeFileSync(
  resolve(outRoot, "SUMMARY.json"),
  `${JSON.stringify({ generatedFor: "PS1 public instance", results: summary }, null, 2)}\n`,
);
const archivePath = resolve("output/PS1-public-results.zip");
mkdirSync(resolve("output"), { recursive: true });
writeFileSync(archivePath, zipArchive(officialFiles));
console.log(`Official nine-file archive: ${archivePath}`);
