/** Paired offline experiment; never changes the deployed algorithm or public CSVs. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { FORMULA_VERSION } from "@railplan/ps1/engine/validate";
import type { Scenario } from "@railplan/ps1/types/ps1";
import { budgetedSearch, type SearchVariant } from "./budgeted-search";
import { generateStressInstances, STRESS_MANIFEST } from "./stress-instances";

const { values } = parseArgs({ options: {
  python: { type: "string", default: ".venv-cpsat/bin/python" },
  output: { type: "string", default: "output/ps1-stress" },
  seconds: { type: "string", default: "60" },
  workers: { type: "string", default: "16" },
  seeds: { type: "string", default: "1" },
  datasets: { type: "string", default: "development" },
  scenarios: { type: "string", default: "C" },
  variants: { type: "string", default: "full,tight,targeted" },
  resume: { type: "boolean", default: false },
} });
const seconds = Number(values.seconds), workers = Number(values.workers);
const seeds = values.seeds!.split(",").map(Number);
const scenarios = values.scenarios!.split(",") as Scenario[];
const variants = values.variants!.split(",") as SearchVariant[];
if (!Number.isFinite(seconds) || seconds < 2 || !Number.isInteger(workers) || workers < 1 ||
  workers > os.availableParallelism() || seeds.some((n) => !Number.isInteger(n) || n < 0 || n > 2_147_483_647) ||
  scenarios.some((s) => !["A", "B", "C"].includes(s)) ||
  variants.some((v) => !["full", "tight", "targeted"].includes(v)) ||
  [seeds, scenarios, variants].some((items) => new Set<string | number>(items).size !== items.length)) throw new Error("Invalid stress benchmark options");

const stress = generateStressInstances();
const controls = ["public", "05-capacity-pressure", "11-priority-contention"].map((id) => ({
  id, split: "control", metadata: { source: "repository fixture" },
  instance: loadInstance(Object.fromEntries(PS1_FILES.map((name) => [name,
    readFileSync(resolve("packages/ps1/data", id === "public" ? id : `synthetic/${id}`, name), "utf8")]))),
}));
const all = [...controls, ...stress];
const selectors = values.datasets!.split(",");
if (selectors.some((s) => !["all", "development", "holdout", "control"].includes(s) && !all.some((d) => d.id === s))) {
  throw new Error("Unknown stress dataset selector");
}
const datasets = all.filter((d) => selectors.includes("all") || selectors.includes(d.split) || selectors.includes(d.id));
if (!datasets.length) throw new Error("No selected datasets");
const output = resolve(values.output!);
mkdirSync(output, { recursive: true });
const summaryFile = resolve(output, "summary.json");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
}
const sourceFiles = ["src/lib/ps1/cp-sat-model.ts", "scripts/ps1/native-selection.ts", "scripts/ps1/requirements.txt",
  ...files("scripts/ps1/benchmark").filter((p) => /\.(ts|py)$/.test(p) && !p.includes(".test.") && !p.includes("test_")),
  ...files("packages/ps1/src").filter((p) => !p.includes(".test."))].sort();
const sourceSha256 = hash(sourceFiles.map((p) => [p, readFileSync(p, "utf8")]));
const host = { cpu: os.cpus()[0]?.model, availableCpus: os.availableParallelism(), memoryGiB: os.totalmem() / 2 ** 30,
  platform: process.platform, arch: process.arch, node: process.version,
  revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sourceSha256,
  python: JSON.parse(execFileSync(values.python!, ["-c", "import sys,platform,ortools,json; print(json.dumps({'executable':sys.executable,'python':platform.python_version(),'ortools':ortools.__version__}))"], { encoding: "utf8" })),
};
const config = { seconds, workers, seeds, scenarios, variants, selectors, formulaVersion: FORMULA_VERSION,
  datasets: datasets.map((d) => ({ id: d.id, split: d.split, inputSha256: hash(d.instance), activities: d.instance.activities.length, metadata: d.metadata })) };
const results: Record<string, unknown>[] = [];
if (existsSync(summaryFile)) {
  if (!values.resume) throw new Error("Results already exist; use fresh output or --resume");
  const old = JSON.parse(readFileSync(summaryFile, "utf8"));
  if (hash(old.config) !== hash(config) || old.host.sourceSha256 !== sourceSha256 ||
    old.host.cpu !== host.cpu || old.host.availableCpus !== host.availableCpus || old.host.node !== host.node ||
    old.host.platform !== host.platform || old.host.arch !== host.arch || hash(old.host.python) !== hash(host.python)) {
    throw new Error("Resume requires unchanged source, inputs, settings and host");
  }
  results.push(...old.results);
}
let complete = false;
const save = () => writeFileSync(summaryFile, JSON.stringify({ schema: "ps1-stress-benchmark-v1", complete,
  generatedAt: new Date().toISOString(), host, config, stressManifest: STRESS_MANIFEST,
  protocol: "Sequential jobs; variant order rotates by case/seed. One deadline includes independent 1s cooperative warm start, native imports/build/search and CSV checks. Child wall guard; synchronous orchestration may overrun and is measured. No planted witness is supplied to any solver. Holdout seeds/families fixed before development runs. Local checker, not reference validator.",
  results }, null, 2) + "\n");
save();
for (const dataset of datasets) {
  // Audit certificates are kept separately and are never arguments to budgetedSearch.
  writeFileSync(resolve(output, `${dataset.id}-instance.json`), JSON.stringify(dataset) + "\n");
  for (const seed of seeds) for (const scenario of scenarios) {
    const rotation = (datasets.indexOf(dataset) + seeds.indexOf(seed)) % variants.length;
    const order = [...variants.slice(rotation), ...variants.slice(0, rotation)];
    for (const variant of order) {
      const key = `${dataset.id}/${scenario}/${seed}/${variant}`;
      if (results.some((row) => row.key === key)) continue;
      let result: ReturnType<typeof budgetedSearch>;
      const started = performance.now();
      try {
        result = budgetedSearch(dataset.instance, scenario, { python: values.python!, seconds, workers, seed, variant });
      } catch (error) {
        results.push({ key, dataset: dataset.id, split: dataset.split, scenario, seed, variant, status: "ERROR",
          selectedScore: null, elapsedMs: performance.now() - started, error: error instanceof Error ? error.message : String(error) });
        save();
        console.log(`${key}: ERROR`);
        continue;
      }
      const { submission, ...metrics } = result;
      const witnessFile = `${dataset.id}-${scenario}-s${seed}-${variant}.json`;
      writeFileSync(resolve(output, witnessFile), JSON.stringify({ instanceSha256: hash(dataset.instance), submission, ...metrics }) + "\n");
      results.push({ key, dataset: dataset.id, split: dataset.split, scenario, seed, witnessFile, ...metrics });
      save();
      console.log(`${key}: ${result.status} score=${result.selectedScore} bound=${result.fullBound} ${Math.round(result.elapsedMs)}ms errors=${result.errors.length}`);
    }
  }
}
complete = true;
save();
