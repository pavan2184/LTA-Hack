import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Disruption } from "@railplan/ps1/engine/disruption";
import type { Pin } from "@railplan/ps1/engine/schedule";
import { validate } from "@railplan/ps1/engine/validate";
import type { AccessRow, Ps1Instance, Scenario, Submission } from "@railplan/ps1/types/ps1";
import { checkedCpSatResult, cpSatPayload, hasPins } from "../../../src/lib/ps1/cp-sat-model";

export { decode } from "../../../src/lib/ps1/cp-sat-model";

export type NativeOptions = {
  workers?: number;
  seed?: number;
  profile?: "default" | "no_lp" | "lns";
  formulation?: "baseline" | "tight";
  incumbent?: Submission;
  movableActivityIds?: string[];
  disruptions?: Disruption[];
  pins?: Pin[];
};

export type NativeResult = {
  schema: string; digest: string; scenario: Scenario; scope: "full" | "repair";
  status: string; objective: number | null; bound: number | null; access: AccessRow[];
  ortoolsVersion: string;
  solveMs: number; buildMs: number; modelAndSolveMs: number;
  firstSolutionMs?: number | null;
  solutionTrace?: { timeMs: number; objective: number; bound: number }[];
  [key: string]: unknown;
};

/** The benchmark and HTTP service share payload derivation, digest and decoding. */
export function nativePayload(instance: Ps1Instance, scenario: Scenario, seconds: number,
  options: NativeOptions = {}) {
  const { incumbent, disruptions = [], pins = [], workers = 1, seed = 1,
    profile = "default" } = options;
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isInteger(workers) || workers < 1 || workers > 256 ||
    !Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647 || !["default", "no_lp", "lns"].includes(profile)) {
    throw new Error("Invalid native seconds/workers/seed/profile");
  }
  if (options.formulation !== undefined && !["baseline", "tight"].includes(options.formulation)) {
    throw new Error("Invalid native formulation");
  }
  // Tightening is implemented by the CP-SAT model, never silently by SCIP.
  if (incumbent && incumbent.scenario !== scenario) throw new Error("Incumbent scenario mismatch");
  const payload = cpSatPayload(instance, { ...options, scenario, seconds, workers, seed, profile });
  if (incumbent && (!validate(instance, incumbent, undefined, disruptions).feasible || !hasPins(incumbent, pins))) {
    throw new Error("Native incumbent must pass local validation");
  }
  return payload;
}

/** Process/model/search/decode timing is separate from the solver's search cap. */
export function runNativeSolver(python: string, engine: "cpsat" | "scip", instance: Ps1Instance,
  scenario: Scenario, seconds: number, options: NativeOptions = {}, wallLimitMs?: number) {
  const started = performance.now();
  if (engine === "scip" && options.formulation === "tight") throw new Error("Tight formulation requires CP-SAT");
  if (wallLimitMs !== undefined && (!Number.isFinite(wallLimitMs) || wallLimitMs <= 0)) {
    throw new Error("Invalid native wall limit");
  }
  const payload = nativePayload(instance, scenario, seconds, options);
  const payloadReady = performance.now();
  const remainingMs = wallLimitMs === undefined ? seconds * 1000 + 60_000 : wallLimitMs - (payloadReady - started);
  if (remainingMs <= 0) throw new Error("Native wall limit exhausted preparing payload");
  const child = spawnSync(python, [resolve(`scripts/ps1/benchmark/${engine === "cpsat" ? "cp_sat" : "scip"}.py`)], {
    input: JSON.stringify(payload), encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
    timeout: Math.max(1, Math.floor(remainingMs)), killSignal: "SIGKILL",
  });
  if (child.error || child.status !== 0) throw new Error(child.error?.message ?? child.stderr);
  const processFinished = performance.now();
  const raw = JSON.parse(child.stdout) as NativeResult;
  const result = checkedCpSatResult(payload, raw, options.disruptions ?? []);
  return { ...raw, ...result, engine, payloadMs: payloadReady - started,
    processMs: processFinished - payloadReady, validationMs: performance.now() - processFinished,
    elapsedMs: performance.now() - started };
}

export function runCpSat(python: string, instance: Ps1Instance, incumbent: Submission,
  seconds: number, movableActivityIds?: string[], disruptions: Disruption[] = [],
  options: Pick<NativeOptions, "workers" | "seed" | "profile" | "pins"> = {}) {
  return runNativeSolver(python, "cpsat", instance, incumbent.scenario, seconds,
    { ...options, incumbent, movableActivityIds, disruptions });
}

// Run against a benchmark witness; no production dependency or server required.
if (process.argv[1]?.endsWith("cp-sat.ts")) {
  const [python, witness, secondsRaw = "5", mode = "full"] = process.argv.slice(2);
  if (!python || !witness || !["full", "repair"].includes(mode) || !(Number(secondsRaw) > 0)) {
    throw new Error("Usage: cp-sat.ts <python> <benchmark-witness.json> [seconds] [full|repair]");
  }
  const { instance, submission } = JSON.parse(readFileSync(witness, "utf8")) as { instance: Ps1Instance; submission: Submission };
  const movable = mode === "repair" ? [...instance.activities].sort((a, b) => {
    const last = (id: string) => Math.max(...submission.access.filter((r) => r.activityId === id).map((r) => r.week));
    return last(b.activityId) - last(a.activityId);
  }).slice(0, 20).map((a) => a.activityId) : undefined;
  const result = runCpSat(python, instance, submission, Number(secondsRaw), movable);
  writeFileSync(`${witness}.${mode}.cpsat.json`, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ status: result.status, objective: result.objective, bound: result.bound, elapsedMs: result.elapsedMs }));
}
