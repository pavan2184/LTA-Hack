/** Untuned, seeded perturbations. Includes failures rather than filtering them. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { solveInstance } from "@railplan/ps1/engine/schedule";
import { validate } from "@railplan/ps1/engine/validate";
import { writeSubmission } from "@railplan/ps1/io/write";
import { parseSubmission } from "@railplan/ps1/io/submission";
import type { Scenario, Submission } from "@railplan/ps1/types/ps1";
const output = resolve(process.argv[2] ?? "output/ps1-holdout");
const count = Number(process.argv[3] ?? 24);
if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error("Count must be 1..1000");
const bases = ["public", "synthetic/05-capacity-pressure", "synthetic/09-separated-eclo-windows", "synthetic/11-priority-contention"];
const results = [];
mkdirSync(output, { recursive: true });
for (let seed = 101; seed < 101 + count; seed += 1) {
  let state = seed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const base = bases[(seed - 101) % bases.length];
  const instance = loadInstance(Object.fromEntries(PS1_FILES.map((name) => [name, readFileSync(resolve("packages/ps1/data", base, name), "utf8")])));
  for (const a of instance.activities) {
    a.totalAccesses = Math.max(1, a.totalAccesses + Math.floor(random() * 3) - 1);
    a.activityPriority = (1 + Math.floor(random() * 3)) as 1 | 2 | 3;
  }
  for (const c of instance.contracts) c.contractPriority = (1 + Math.floor(random() * 3)) as 1 | 2 | 3;
  const digest = createHash("sha256").update(JSON.stringify(instance)).digest("hex");
  for (const mode of ["legacy", "hybrid"] as const) {
    const candidates: Submission[] = [];
    for (const scenario of ["A", "B", "C"] as Scenario[]) {
      const outcome = solveInstance(instance, { scenario, searchMode: mode,
        initialCandidates: mode === "hybrid" ? candidates : [], optimizationBudget: { seed } });
      if (outcome.status === "FEASIBLE") {
        const csv = writeSubmission(outcome.submission!);
        const submission = parseSubmission({ access: csv["SCHEDULE_ACCESS.csv"], occupancy: csv["SCHEDULE_OCCUPANCY.csv"], results: csv["RESULTS.csv"] });
        if (!validate(instance, submission).feasible) throw new Error(`Invalid round-trip ${seed}/${scenario}/${mode}`);
        candidates.push(submission);
      }
      results.push({ seed, base, digest, mode, scenario, status: outcome.status,
        score: outcome.validation?.objectiveScore ?? null, elapsedMs: outcome.diagnostics.elapsedMs });
    }
  }
  console.log(`holdout ${seed} complete`);
}
writeFileSync(resolve(output, "summary.json"), JSON.stringify({ count, node: process.version,
  generator: "workload +/-1; uniform activity/contract priorities; seed 101 onwards; four source templates", results }, null, 2) + "\n");
