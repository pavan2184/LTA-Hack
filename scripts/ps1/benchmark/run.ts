/** Paired PS1 benchmark; never writes inputs or official submission artifacts. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { writeSubmission } from "@railplan/ps1/io/write";
import { parseSubmission } from "@railplan/ps1/io/submission";
import { solveInstance } from "@railplan/ps1/engine/schedule";
import { validate } from "@railplan/ps1/engine/validate";
import type { Scenario, Submission } from "@railplan/ps1/types/ps1";
import manifest from "../../../packages/ps1/data/synthetic/manifest.json";

const output = resolve(process.argv[2] ?? "output/ps1-benchmark");
const selected = process.argv[3];
const maxTimeMs = process.argv[4] ? Number(process.argv[4]) : undefined;
const seeds = process.argv[5] ? Number(process.argv[5]) : 1;
if ((maxTimeMs !== undefined && (!Number.isFinite(maxTimeMs) || maxTimeMs <= 0)) || !Number.isInteger(seeds) || seeds < 1) {
  throw new Error("Usage: run.ts [output-dir] [dataset-id] [time-ms] [seed-count]");
}
mkdirSync(output, { recursive: true });
const rows: Record<string, unknown>[] = [];
const datasets = [{ id: "public", dir: "packages/ps1/data/public" },
  ...manifest.datasets.map(({ id }) => ({ id, dir: `packages/ps1/data/synthetic/${id}` }))]
  .filter(({ id }) => !selected || id === selected);
if (!datasets.length) throw new Error(`Unknown dataset ${selected}`);
for (const dataset of datasets) {
  const files = Object.fromEntries(PS1_FILES.map((name) => [name, readFileSync(resolve(dataset.dir, name), "utf8")]));
  const instance = loadInstance(files);
  const digest = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  for (let seed = 1; seed <= seeds; seed += 1) {
    for (const searchMode of ["legacy", "hybrid"] as const) {
      const candidates: Submission[] = [];
      for (const scenario of ["A", "B", "C"] as Scenario[]) {
        const outcome = solveInstance(instance, { scenario, searchMode,
          initialCandidates: searchMode === "hybrid" ? candidates : [],
          optimizationBudget: { seed, maxTimeMs },
        });
        let score: number | null = null;
        let hardViolations: number | null = null;
        if (outcome.submission) {
          const csv = writeSubmission(outcome.submission);
          const roundTrip = parseSubmission({ access: csv["SCHEDULE_ACCESS.csv"],
            occupancy: csv["SCHEDULE_OCCUPANCY.csv"], results: csv["RESULTS.csv"] });
          const report = validate(instance, roundTrip);
          if (outcome.status === "FEASIBLE" && !report.feasible) throw new Error("Round-trip validation failed");
          hardViolations = report.hardViolations.length;
          score = report.objectiveScore ?? null;
          if (report.feasible) candidates.push(roundTrip);
          writeFileSync(resolve(output, `${dataset.id}-${scenario}-${searchMode}-${seed}.json`), JSON.stringify({ instance, submission: roundTrip, report }));
        }
        const row = { dataset: dataset.id, digest, scenario, searchMode, seed,
          status: outcome.status, score, hardViolations, ...outcome.diagnostics };
        rows.push(row);
        console.log(`${dataset.id} ${scenario} ${searchMode} score=${score} ${outcome.diagnostics.elapsedMs}ms`);
      }
    }
  }
}
writeFileSync(resolve(output, "summary.json"), JSON.stringify({ node: process.version,
  generatedAt: new Date().toISOString(), maxTimeMs: maxTimeMs ?? null,
  conformance: "local; cross_possession_night_alignment is undecidable", results: rows }, null, 2) + "\n");
