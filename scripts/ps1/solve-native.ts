/** Native CLI for the engineer handoff. Run from the repository root. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { solveInstance } from "@railplan/ps1/engine/schedule";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import type { Scenario, Submission } from "@railplan/ps1/types/ps1";
import { runNativeSolver } from "./benchmark/cp-sat";
import { checkSubmission, selectNativeSubmission } from "./native-selection";

const HELP = `Usage: node --import tsx scripts/ps1/solve-native.ts --input <eight-file-directory> [options]

  --python <executable>  Default: .venv-cpsat/bin/python
  --output <directory>  Default: output/ps1-native (must be new or empty)
  --seconds <number>    Native search limit PER SCENARIO; default: 60
  --workers <integer>   Native CP-SAT workers; default: 16 (target: 32-vCPU VM)
  --seed <integer>      Search seed; default: 1 (parallel runs are nondeterministic)
  --scenarios <list>    A,B,C or ABC; default: A,B,C

Scenarios run sequentially. Three 60-second searches can take about 180 seconds,
plus heuristic, Python startup, model construction, validation and export time.
Each successful scenario has exactly three official CSVs. RUN_REPORT.json is an
auxiliary report outside those directories. Unresolved scenarios export no CSVs
and return exit code 1; a validated incumbent survives native search failures.
This CLI does not deploy an HTTP service or replace the organiser's validator.
`;

function main() {
  const { values } = parseArgs({ options: {
    input: { type: "string" }, output: { type: "string", default: "output/ps1-native" },
    python: { type: "string", default: ".venv-cpsat/bin/python" },
    seconds: { type: "string", default: "60" }, workers: { type: "string", default: "16" },
    seed: { type: "string", default: "1" }, scenarios: { type: "string", default: "A,B,C" },
    help: { type: "boolean", short: "h" },
  }, strict: true, allowPositionals: false });
  if (values.help) { console.log(HELP); return; }
  if (!values.input) throw new Error(`--input is required.\n${HELP}`);
  const seconds = Number(values.seconds), workers = Number(values.workers), seed = Number(values.seed);
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isInteger(workers) || workers < 1 || workers > 256 ||
    !Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647) {
    throw new Error("Require positive finite --seconds, integer --workers 1..256, and integer --seed 0..2147483647");
  }
  const scenarioText = values.scenarios!.toUpperCase();
  const scenarioNames = scenarioText.includes(",") ? scenarioText.split(",").map((s) => s.trim()) : [...scenarioText];
  if (!scenarioNames.length || scenarioNames.some((s) => !["A", "B", "C"].includes(s)) ||
    new Set(scenarioNames).size !== scenarioNames.length) {
    throw new Error("--scenarios must contain unique A, B and/or C values, for example A,B,C or C");
  }
  const scenarios = scenarioNames as Scenario[];
  const input = resolve(values.input), output = resolve(values.output!);
  if (existsSync(output) && readdirSync(output).length) {
    throw new Error(`Output directory is not empty: ${output}. Choose a fresh --output directory to avoid stale results.`);
  }
  const files = Object.fromEntries(PS1_FILES.map((name) => [name, readFileSync(resolve(input, name), "utf8")]));
  const instance = loadInstance(files);
  const instanceDigest = createHash("sha256").update(JSON.stringify(instance)).digest("hex");
  mkdirSync(output, { recursive: true });
  const runStarted = performance.now();
  const results: Record<string, unknown>[] = [];
  const candidates: Submission[] = [];
  const config = { python: values.python, input, output, instanceDigest, secondsPerScenario: seconds,
    workers, seed, profile: "default", scenarios, targetHardware: "32 vCPU / 64 GiB RAM",
    timing: "Native search limit excludes heuristic construction, process startup, model build, validation and export.",
    execution: "sequential_scenarios", maximumCombinedNativeSearchSeconds: seconds * scenarios.length };
  let unresolved = false;
  const saveReport = (complete: boolean) => writeFileSync(resolve(output, "RUN_REPORT.json"),
    JSON.stringify({ schema: "ps1-native-run-v1", generatedAt: new Date().toISOString(), complete,
      allScenariosResolved: complete && !unresolved,
      config, elapsedMs: performance.now() - runStarted, conformance: "local",
      conformanceNote: "The local checker is not the organiser's reference validator; cross-possession physical-night alignment is not certified.",
      results }, null, 2) + "\n");
  saveReport(false);
  for (const scenario of scenarios) {
    console.error(`Scenario ${scenario}: constructing a validated incumbent, then up to ${seconds}s native search with ${workers} workers.`);
    const scenarioStarted = performance.now();
    const warnings: string[] = [];
    let incumbent: Submission | undefined;
    let heuristicStatus = "ERROR";
    let heuristicDiagnostics: unknown;
    try {
      const outcome = solveInstance(instance, { scenario, initialCandidates: candidates,
        optimizationBudget: { seed } });
      heuristicStatus = outcome.status;
      heuristicDiagnostics = outcome.diagnostics;
      if (outcome.status === "FEASIBLE" && outcome.submission) {
        incumbent = checkSubmission(instance, scenario, outcome.submission).submission;
      } else {
        warnings.push("Heuristic found no validated complete schedule; this is not a proof of infeasibility. Native search will start cold.");
      }
    } catch (cause) {
      warnings.push(`Heuristic failed; native search will start cold: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    const heuristicMs = performance.now() - scenarioStarted;
    const zeroIncumbent = incumbent !== undefined && checkSubmission(instance, scenario, incumbent).score === 0;
    let native: ReturnType<typeof runNativeSolver> | undefined;
    let nativeStatus = zeroIncumbent ? "NOT_RUN_ZERO_PENALTY" : "ERROR";
    const nativeStarted = performance.now();
    if (!zeroIncumbent) {
      try {
        native = runNativeSolver(values.python!, "cpsat", instance, scenario, seconds,
          { workers, seed, profile: "default", incumbent });
        nativeStatus = native.status;
        if (!["FEASIBLE", "OPTIMAL"].includes(nativeStatus)) {
          warnings.push(`Native status ${nativeStatus}; retaining a validated incumbent if available.`);
        }
      } catch (cause) {
        warnings.push(`Native search failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
    const nativeElapsedMs = performance.now() - nativeStarted;
    const selection = selectNativeSubmission(instance, scenario, incumbent, native);
    warnings.push(...selection.warnings);
    let nativeMetrics: Record<string, unknown> | undefined;
    if (native) {
      const { submission: _submission, access: _access, ...metrics } = native;
      void _submission; void _access;
      nativeMetrics = metrics;
    }
    if (selection.selected) {
      const checked = selection.selected;
      const directory = resolve(output, scenario);
      mkdirSync(directory);
      for (const [name, csv] of Object.entries(checked.files)) writeFileSync(resolve(directory, name), csv);
      candidates.push(checked.submission);
    } else {
      unresolved = true;
    }
    const row = { scenario, status: selection.selected ? "FEASIBLE" : "UNRESOLVED",
      source: selection.source, score: selection.selected?.score ?? null,
      optimalityEvidence: selection.optimalityEvidence, incumbentScore: selection.incumbentScore,
      nativeCandidateScore: selection.candidateScore, heuristicStatus,
      heuristicStatusNote: "A heuristic INFEASIBLE status means search exhaustion, not mathematical proof.",
      heuristicDiagnostics, heuristicMs, nativeStatus, nativeElapsedMs, nativeMetrics,
      endToEndMs: performance.now() - scenarioStarted, validation: selection.selected?.validation,
      exportedFiles: selection.selected ? Object.keys(selection.selected.files).map((name) => `${scenario}/${name}`) : [],
      warnings };
    results.push(row);
    saveReport(false);
    console.error(`Scenario ${scenario}: ${row.status}, score=${row.score}, source=${row.source}, native=${nativeStatus}.`);
  }
  saveReport(true);
  console.log(JSON.stringify({ output, report: resolve(output, "RUN_REPORT.json"),
    complete: !unresolved, results: results.map(({ scenario, status, source, score, nativeStatus }) =>
      ({ scenario, status, source, score, nativeStatus })) }, null, 2));
  if (unresolved) process.exitCode = 1;
}

try { main(); } catch (cause) {
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exitCode = 1;
}
