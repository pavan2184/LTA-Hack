/** Full-model comparison, including heuristic failures and locally checked CSVs. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { cpus, platform, arch } from "node:os";
import { resolve } from "node:path";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { validate, FORMULA_VERSION } from "@railplan/ps1/engine/validate";
import type { Scenario, Submission } from "@railplan/ps1/types/ps1";
import { checkedCpSatResult, cpSatPayload } from "../../../src/lib/ps1/cp-sat-model";

interface BrowserRow {
  dataset: string;
  scenario: Scenario;
  searchMode: "legacy" | "hybrid";
  seed: number;
  status: string;
  score: number | null;
  elapsedMs: number;
}

const [python, directory = "output/ps1-v2-matrix",
  resultFile = "scripts/ps1/benchmark/native-results.json"] = process.argv.slice(2);
if (!python) throw new Error("Usage: native-matrix.ts <python> [browser-witness-directory] [result-json]");
const summary = JSON.parse(readFileSync(resolve(directory, "summary.json"), "utf8")) as {
  generatedAt: string; results: BrowserRow[];
};
// A corrected scorer must not silently relabel historical browser scores.
for (const row of summary.results) {
  const witness = resolve(directory, `${row.dataset}-${row.scenario}-${row.searchMode}-${row.seed}.json`);
  if (!existsSync(witness)) {
    if (row.status === "FEASIBLE") throw new Error(`Missing feasible browser witness: ${witness}`);
    continue;
  }
  const value = JSON.parse(readFileSync(witness, "utf8")) as {
    instance: Parameters<typeof validate>[0]; submission: Submission;
  };
  const checked = validate(value.instance, value.submission);
  if ((checked.objectiveScore ?? null) !== row.score ||
    (row.status === "FEASIBLE" && !checked.feasible)) {
    throw new Error(`Browser scores are stale or invalid under ${FORMULA_VERSION}; rerun run.ts: ${witness}`);
  }
}
const output = resolve(directory, "native");
mkdirSync(output, { recursive: true });
const modelPath = resolve("scripts/ps1/benchmark/cp_sat.py");
const modelSha256 = createHash("sha256").update(readFileSync(modelPath)).digest("hex");
const metadata = {
  schema: "ps1-native-matrix-v2",
  scoringVersion: FORMULA_VERSION,
  startedAt: new Date().toISOString(),
  browserGeneratedAt: summary.generatedAt,
  node: process.version, platform: platform(), architecture: arch(),
  cpu: cpus()[0]?.model ?? "unknown", logicalCpuCount: cpus().length,
  modelSha256,
  scope: "full models only; no conditional repair proofs",
  budgets: { workers: 8, initialSearchSeconds: 5, unknownRetrySearchSeconds: 20, seed: 1 },
  comparison: "Default iteration-budget browser quality versus time-limited native quality; not equal wall time. Native total time includes payload, Python startup, model, solve and local checking.",
  conformance: "Local checker only; cross_possession_night_alignment remains undecidable.",
};
const rows: Record<string, unknown>[] = [];
const persist = (completed = false) => writeFileSync(resolve(resultFile), JSON.stringify({
  ...metadata, completed, ...(completed ? { completedAt: new Date().toISOString() } : {}), results: rows,
}, null, 2) + "\n");

for (const hybrid of summary.results.filter((row) => row.searchMode === "hybrid" && row.seed === 1)) {
  const legacy = summary.results.find((row) => row.dataset === hybrid.dataset &&
    row.scenario === hybrid.scenario && row.searchMode === "legacy" && row.seed === 1);
  const datasetDir = hybrid.dataset === "public" ? "public" : `synthetic/${hybrid.dataset}`;
  const files = Object.fromEntries(PS1_FILES.map((file) => [file,
    readFileSync(resolve("packages/ps1/data", datasetDir, file), "utf8")]));
  const inputDigest = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  const instance = loadInstance(files);
  const witness = resolve(directory, `${hybrid.dataset}-${hybrid.scenario}-hybrid-1.json`);
  let incumbent: Submission | undefined;
  if (existsSync(witness)) {
    const value = JSON.parse(readFileSync(witness, "utf8")) as { submission: Submission };
    if (validate(instance, value.submission).feasible) incumbent = value.submission;
  }
  // No incumbent is required: unresolved heuristic instances still reach CP-SAT.
  const attempts: Record<string, unknown>[] = [];
  let nativeStatus = "ERROR";
  let nativeScore: number | null = null;
  let nativeBound: number | null = null;
  let nativeFeasible = false;
  for (const seconds of [5, 20]) {
    const started = performance.now();
    try {
      const payload = cpSatPayload(instance, { scenario: hybrid.scenario, seconds,
        workers: 8, seed: 1, incumbent });
      const child = spawnSync(python, [modelPath], { input: JSON.stringify(payload),
        encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: seconds * 1000 + 20_000 });
      if (child.error || child.status !== 0) throw new Error(child.error?.message ?? child.stderr);
      const result = checkedCpSatResult(payload, JSON.parse(child.stdout));
      const { submission, report, access: _access, ...metrics } = result;
      void _access;
      const measured = { ...metrics, seconds, workers: 8,
        totalElapsedMs: performance.now() - started,
        locallyFeasible: report?.feasible ?? false,
        checkedScore: report?.objectiveScore ?? null,
        formulaVersion: report?.formulaVersion ?? FORMULA_VERSION };
      attempts.push(measured);
      nativeStatus = result.status;
      nativeScore = report?.objectiveScore ?? null;
      nativeBound = result.bound;
      nativeFeasible = report?.feasible ?? false;
      writeFileSync(resolve(output, `${hybrid.dataset}-${hybrid.scenario}-${seconds}s.json`),
        JSON.stringify({ payload, result: { ...measured, submission, report } }, null, 2) + "\n");
      if (result.status !== "UNKNOWN") break;
    } catch (cause) {
      attempts.push({ status: "ERROR", seconds, totalElapsedMs: performance.now() - started,
        error: cause instanceof Error ? cause.message : String(cause) });
      nativeStatus = "ERROR";
      break;
    }
  }
  const browserScore = incumbent ? validate(instance, incumbent).objectiveScore! : null;
  const selectedScore = browserScore === null ? nativeScore : nativeScore === null
    ? browserScore : Math.min(browserScore, nativeScore);
  rows.push({ dataset: hybrid.dataset, scenario: hybrid.scenario, inputDigest,
    legacy: legacy ? { status: legacy.status, score: legacy.score, elapsedMs: legacy.elapsedMs } : null,
    hybrid: { status: hybrid.status, score: browserScore, elapsedMs: hybrid.elapsedMs },
    native: { status: nativeStatus, score: nativeScore, bound: nativeBound,
      locallyFeasible: nativeFeasible, attempts },
    selected: { status: selectedScore === null ? "UNRESOLVED" : "LOCALLY_FEASIBLE",
      score: selectedScore,
      source: nativeScore !== null && (browserScore === null || nativeScore < browserScore) ? "native" :
        browserScore !== null ? "hybrid" : "none",
      provenOptimalForLocalFullModel: nativeStatus === "OPTIMAL" && selectedScore === nativeScore },
  });
  persist();
  console.log(JSON.stringify({ dataset: hybrid.dataset, scenario: hybrid.scenario,
    hybrid: browserScore, native: nativeScore, bound: nativeBound, nativeStatus }));
}
persist(true);
