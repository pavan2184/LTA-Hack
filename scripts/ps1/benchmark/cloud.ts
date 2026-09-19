/** Sequential native comparisons. Never provisions infrastructure or changes public results. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { writeSubmission } from "@railplan/ps1/io/write";
import { parseSubmission } from "@railplan/ps1/io/submission";
import { solveInstance } from "@railplan/ps1/engine/schedule";
import { FORMULA_VERSION, validate } from "@railplan/ps1/engine/validate";
import type { Ps1Instance, Scenario, Submission } from "@railplan/ps1/types/ps1";
import manifest from "../../../packages/ps1/data/synthetic/manifest.json";
import { runNativeSolver } from "./cp-sat";

const { values } = parseArgs({ options: {
  python: { type: "string", default: ".venv-cpsat/bin/python" },
  output: { type: "string", default: "output/ps1-cloud" },
  seconds: { type: "string", default: "60" },
  workers: { type: "string", default: "16" },
  seeds: { type: "string", default: "1" },
  datasets: { type: "string", default: "all" },
  scenarios: { type: "string", default: "A,B,C" },
  variants: { type: "string", default: "cpsat-warm,cpsat-cold,cpsat-lns,scip-warm,hybrid-extended" },
  holdouts: { type: "string", default: "0" },
  resume: { type: "boolean", default: false },
} });
const seconds = Number(values.seconds);
const workers = values.workers!.split(",").map(Number);
const seeds = values.seeds!.split(",").map(Number);
const variants = values.variants!.split(",");
const scenarios = values.scenarios!.split(",") as Scenario[];
const holdouts = Number(values.holdouts);
if (!Number.isFinite(seconds) || seconds <= 0 || workers.some((v) => !Number.isInteger(v) || v < 1 || v > 256) ||
  seeds.some((v) => !Number.isInteger(v) || v < 0 || v > 2_147_483_647) ||
  !Number.isInteger(holdouts) || holdouts < 0 || holdouts > 1000 ||
  scenarios.some((v) => !["A", "B", "C"].includes(v)) ||
  variants.some((v) => !["cpsat-warm", "cpsat-cold", "cpsat-base-lin0", "cpsat-lns", "scip-warm", "hybrid-extended"].includes(v))) {
  throw new Error("Invalid benchmark arguments");
}
if (Math.max(...workers) > os.availableParallelism()) {
  throw new Error(`Requested workers exceed this host's ${os.availableParallelism()} available CPUs; run the cloud sweep on the cloud host`);
}
const output = resolve(values.output!);
mkdirSync(output, { recursive: true });
const summaryPath = resolve(output, "summary.json");
const config = { seconds, workers, seeds, variants, scenarios, datasets: values.datasets, holdouts, formulaVersion: FORMULA_VERSION };
let revision = "unknown";
try { revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { /* metadata only */ }
function treeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? treeFiles(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
}
const codeFiles = ["scripts/ps1/benchmark/cloud.ts", "scripts/ps1/benchmark/cp-sat.ts", "scripts/ps1/benchmark/cp_sat.py", "scripts/ps1/benchmark/scip.py",
  "src/lib/ps1/cp-sat-model.ts", "scripts/ps1/requirements.txt",
  ...treeFiles("packages/ps1/src").filter((p) => !p.endsWith(".test.ts")),
  ...treeFiles("packages/ps1/data/public"), ...treeFiles("packages/ps1/data/synthetic")].sort();
const sourceDigest = createHash("sha256");
for (const file of codeFiles) if (existsSync(file)) sourceDigest.update(file).update(readFileSync(file));
const sourceSha256 = sourceDigest.digest("hex");
const pythonRuntime = JSON.parse(execFileSync(values.python!, ["-c",
  "import sys,platform,ortools,json; print(json.dumps({'executable':sys.executable,'python':platform.python_version(),'ortools':ortools.__version__}))"], { encoding: "utf8", timeout: 60_000 }));
const host = { platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model,
  availableCpus: os.availableParallelism(), memoryGiB: os.totalmem() / 2 ** 30,
  node: process.version, revision, sourceSha256, pythonRuntime };
const rows: Record<string, unknown>[] = [];
if (values.resume && existsSync(summaryPath)) {
  const previous = JSON.parse(readFileSync(summaryPath, "utf8"));
  if (JSON.stringify(previous.config) !== JSON.stringify(config) || previous.host.sourceSha256 !== sourceSha256 ||
    previous.host.cpu !== host.cpu || previous.host.availableCpus !== host.availableCpus ||
    JSON.stringify(previous.host.pythonRuntime) !== JSON.stringify(host.pythonRuntime)) {
    throw new Error("Resume requires identical configuration, solver source and host CPU configuration");
  }
  rows.push(...previous.results);
} else if (existsSync(summaryPath)) {
  throw new Error("Output already has results; use --resume or a new directory");
}
let complete = false;
const save = () => writeFileSync(summaryPath, JSON.stringify({ schema: "ps1-cloud-benchmark-v1", complete,
  generatedAt: new Date().toISOString(), config, host,
  timing: `${seconds}s is a per-scenario native solver limit; heuristic, imports, build and validation are additional and reported. Sequential runs. firstSolutionMs is a native-model candidate timestamp; estimatedPipelineMs sums independently timed stages.`,
  conformance: "local checker; not reference validator; cross_possession_night_alignment undecidable",
  results: rows }, null, 2) + "\n");
const record = (row: Record<string, unknown>) => {
  rows.push(row); save();
  console.log(`${row.dataset} ${row.scenario} ${row.variant} w=${row.workers} seed=${row.seed}: ${row.status} score=${row.selectedScore} native=${row.objective ?? "-"} bound=${row.bound ?? "-"} ${Math.round(Number(row.elapsedMs))}ms`);
};
const done = (key: string) => rows.some((r) => r.key === key);
const load = (dir: string) => loadInstance(Object.fromEntries(PS1_FILES.map((name) =>
  [name, readFileSync(resolve(dir, name), "utf8")])));
const selected = values.datasets!.split(",");
const allDatasets = [{ id: "public", dir: "packages/ps1/data/public" },
  ...manifest.datasets.map(({ id }) => ({ id, dir: `packages/ps1/data/synthetic/${id}` }))];
if (selected.some((id) => id !== "all" && !allDatasets.some((d) => d.id === id))) throw new Error("Unknown dataset");
const datasets = allDatasets.filter((d) => selected.includes("all") || selected.includes(d.id))
  .map((d) => ({ id: d.id, instance: load(d.dir) }));
// Same untuned perturbation generator as holdout.ts; failures enter native runs too.
const bases = ["public", "synthetic/05-capacity-pressure", "synthetic/09-separated-eclo-windows", "synthetic/11-priority-contention"];
for (let n = 0; n < holdouts; n += 1) {
  let state = 101 + n;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const instance = load(`packages/ps1/data/${bases[n % bases.length]}`);
  for (const a of instance.activities) {
    a.totalAccesses = Math.max(1, a.totalAccesses + Math.floor(random() * 3) - 1);
    a.activityPriority = (1 + Math.floor(random() * 3)) as 1 | 2 | 3;
  }
  for (const c of instance.contracts) c.contractPriority = (1 + Math.floor(random() * 3)) as 1 | 2 | 3;
  datasets.push({ id: `holdout-${101 + n}`, instance });
}

function checked(instance: Ps1Instance, submission: Submission) {
  const csv = writeSubmission(submission);
  const parsed = parseSubmission({ access: csv["SCHEDULE_ACCESS.csv"], occupancy: csv["SCHEDULE_OCCUPANCY.csv"], results: csv["RESULTS.csv"] });
  const report = validate(instance, parsed);
  if (!report.feasible) throw new Error("Heuristic CSV round-trip validation failed");
  return { submission: parsed, score: report.objectiveScore! };
}

for (const { id: dataset, instance } of datasets) {
  const instanceDigest = createHash("sha256").update(JSON.stringify(instance)).digest("hex");
  for (const seed of seeds) {
    const candidates: Submission[] = [];
    let prerequisiteMs = 0;
    for (const scenario of ["A", "B", "C"] as Scenario[]) {
      const baselineFile = resolve(output, `${dataset}-${scenario}-s${seed}-baseline.json`);
      let baseline: { submission?: Submission; score: number | null; elapsedMs: number; status: string };
      if (values.resume && existsSync(baselineFile)) {
        const saved = JSON.parse(readFileSync(baselineFile, "utf8"));
        if (saved.instanceDigest !== instanceDigest) throw new Error("Resumed baseline instance digest mismatch");
        if (saved.submission && checked(instance, saved.submission).score !== saved.score) throw new Error("Resumed baseline invalid");
        baseline = saved;
      }
      else {
        const start = performance.now();
        const outcome = solveInstance(instance, { scenario, initialCandidates: candidates, optimizationBudget: { seed } });
        const valid = outcome.status === "FEASIBLE" ? checked(instance, outcome.submission!) : undefined;
        baseline = { ...valid, score: valid?.score ?? null, elapsedMs: performance.now() - start, status: outcome.status };
        writeFileSync(baselineFile, JSON.stringify({ instance, instanceDigest, ...baseline }) + "\n");
      }
      if (baseline.submission) candidates.push(baseline.submission);
      if (scenarios.includes(scenario)) {
        const base = { dataset, instanceDigest, scenario, seed, baselineScore: baseline.score,
          baselineMs: baseline.elapsedMs, prerequisiteMs, activities: instance.activities.length };
        const baselineKey = `${dataset}/${scenario}/${seed}/baseline`;
        if (!done(baselineKey)) record({ ...base, key: baselineKey, variant: "hybrid-baseline", workers: 1,
          status: baseline.status, selectedScore: baseline.score, elapsedMs: baseline.elapsedMs });
        for (const variant of variants) for (const workerCount of variant === "hybrid-extended" ? [1] : workers) {
          const key = `${dataset}/${scenario}/${seed}/${variant}/${workerCount}`;
          if (done(key)) continue;
          const start = performance.now();
          try {
            let selectedSubmission = baseline.submission;
            let selectedScore = baseline.score;
            let selectedSource = baseline.submission ? "heuristic" : "none";
            let nativeSubmission: Submission | undefined;
            let metrics: Record<string, unknown>;
            if (variant === "hybrid-extended") {
              const result = solveInstance(instance, { scenario, initialCandidates: candidates,
                optimizationBudget: { seed, maxTimeMs: seconds * 1000, maxNeighbourEvaluations: 2500 } });
              const candidate = result.status === "FEASIBLE" ? checked(instance, result.submission!) : undefined;
              nativeSubmission = candidate?.submission;
              if (candidate && (selectedScore === null || candidate.score < selectedScore)) {
                selectedSubmission = candidate.submission; selectedScore = candidate.score; selectedSource = variant;
              }
              metrics = { status: result.status, objective: candidate?.score ?? null,
                elapsedMs: performance.now() - start, diagnostics: result.diagnostics, bound: null };
            } else {
              const result = runNativeSolver(values.python!, variant === "scip-warm" ? "scip" : "cpsat", instance, scenario, seconds,
                { workers: workerCount, seed, incumbent: variant === "cpsat-cold" ? undefined : baseline.submission,
                  profile: variant === "cpsat-base-lin0" ? "no_lp" : variant === "cpsat-lns" ? "lns" : "default" });
              const { submission, access: _access, ...nativeMetrics } = result;
              void _access;
              metrics = nativeMetrics;
              nativeSubmission = submission;
              if (submission && result.objective !== null && (selectedScore === null || result.objective < selectedScore)) {
                selectedSubmission = submission; selectedScore = result.objective; selectedSource = variant;
              }
            }
            if (selectedSubmission && checked(instance, selectedSubmission).score !== selectedScore) throw new Error("Selected schedule/score mismatch");
            writeFileSync(resolve(output, `${dataset}-${scenario}-s${seed}-${variant}-w${workerCount}.json`),
              JSON.stringify({ instanceDigest, selectedScore, selectedSource, selectedSubmission,
                nativeSubmission, ...metrics }) + "\n");
            record({ ...base, ...metrics, key, variant, workers: workerCount, selectedScore, selectedSource,
              selectedFeasible: !!selectedSubmission,
              warmStartProvided: variant !== "cpsat-cold" && !!baseline.submission,
              estimatedPipelineMs: prerequisiteMs + baseline.elapsedMs + Number(metrics.elapsedMs),
              variantElapsedMs: performance.now() - start });
          } catch (error) {
            record({ ...base, key, variant, workers: workerCount, status: "ERROR", selectedScore: baseline.score,
              selectedFeasible: !!baseline.submission, selectedSource: baseline.submission ? "heuristic" : "none",
              elapsedMs: performance.now() - start, error: error instanceof Error ? error.message : String(error) });
          }
        }
      }
      prerequisiteMs += baseline.elapsedMs;
    }
  }
}
complete = true;
save();
