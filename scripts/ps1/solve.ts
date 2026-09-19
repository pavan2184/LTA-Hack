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
import { solveNative } from "../../src/lib/ps1/server-solver";
import { validate } from "@railplan/ps1/engine/validate";
import type { Scenario, Submission } from "@railplan/ps1/types/ps1";

async function main() {
  const dataDir = resolve("packages/ps1/data/public");
  const outRoot = resolve("packages/ps1/data/results");

  const instance = loadInstance(
    Object.fromEntries(PS1_FILES.map((name) => [name, readFileSync(resolve(dataDir, name), "utf8")])),
  );

  const summary: Record<string, unknown>[] = [];
  const outputs: {
    scenario: Scenario;
    submission: Submission;
    report: ReturnType<typeof validate>;
  }[] = [];

  for (const scenario of ["A", "B", "C"] as Scenario[]) {
    const started = performance.now();
    const outcome = await solveNative(instance, { scenario });
    if (outcome.status !== "FEASIBLE" || !outcome.submission) {
      throw new Error(`Scenario ${scenario} has no complete solution; refusing to export`);
    }
    const submission = outcome.submission;
    const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
    const report = validate(instance, submission);
    if (!report.feasible) {
      throw new Error(`Scenario ${scenario} failed local validation; existing public results were not replaced`);
    }
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
      solver: outcome.diagnostics.solver,
    });
  }

  console.table(summary);
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
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
