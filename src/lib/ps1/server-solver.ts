import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import type { Disruption } from "@railplan/ps1/engine/disruption";
import { solveInstance, type Pin } from "@railplan/ps1/engine/schedule";
import { validate } from "@railplan/ps1/engine/validate";
import { parseSubmission } from "@railplan/ps1/io/submission";
import { writeSubmission } from "@railplan/ps1/io/write";
import type { Ps1Instance, Scenario, SolveDiagnostics, SolveOutcome, Submission } from "@railplan/ps1/types/ps1";
import { checkedCpSatResult, cpSatPayload, hasPins } from "./cp-sat-model";

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

export class NativeSolverUnavailableError extends Error {
  constructor() {
    super("The native PS1 solver is unavailable. Install Python 3 and the pinned OR-Tools requirements on the server.");
    this.name = "NativeSolverUnavailableError";
  }
}

export interface NativeSolveOptions {
  scenario: Scenario;
  pins?: Pin[];
  disruptions?: Disruption[];
  signal?: AbortSignal;
}

/** Internal benchmark settings. The HTTP route never accepts these from clients. */
export interface NativeSolverConfiguration {
  seconds?: number;
  workers?: number;
  python?: string;
  warmStartMs?: number;
}

function abortError() {
  return new DOMException("The solve was cancelled.", "AbortError");
}

/** Async process isolation keeps native search off Node's request event loop. */
export function runNativeProcess(payload: ReturnType<typeof cpSatPayload>, options: {
  python: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{ timedOut: true } | { timedOut: false; value: unknown }> {
  if (options.signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolveResult, reject) => {
    const child = spawn(options.python, [resolve("scripts/ps1/benchmark/cp_sat.py")], {
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let timedOut = false;
    let failure: Error | undefined;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", cancel);
      if (error) reject(error);
      else if (timedOut) resolveResult({ timedOut: true });
      else {
        try { resolveResult({ timedOut: false, value: JSON.parse(stdout) }); }
        catch { reject(new Error("The native PS1 solver returned malformed output.")); }
      }
    };
    const cancel = () => {
      failure = abortError();
      child.kill("SIGKILL");
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", cancel, { once: true });
    // Cancellation may have happened between spawn and listener registration.
    if (options.signal?.aborted) cancel();
    const receive = (chunk: string, channel: "stdout" | "stderr") => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_OUTPUT_BYTES) {
        failure = new Error("The native PS1 solver exceeded its output limit.");
        child.kill("SIGKILL");
        return;
      }
      if (channel === "stdout") stdout += chunk;
      else stderr += chunk;
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => receive(chunk, "stdout"));
    child.stderr.on("data", (chunk: string) => receive(chunk, "stderr"));
    child.stdin.on("error", () => {
      // A child that exits before reading input emits EPIPE; close/error below
      // classifies the cause without leaking uploaded data or native tracebacks.
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(error.code === "ENOENT" ? new NativeSolverUnavailableError() :
        new Error("The native PS1 solver could not start."));
    });
    child.on("close", (code) => {
      if (failure) return finish(failure);
      if (!timedOut && code !== 0) {
        return finish(/(?:ModuleNotFoundError|ImportError).*ortools/.test(stderr) ?
          new NativeSolverUnavailableError() : new Error("The native PS1 solver failed while building or solving the model."));
      }
      finish();
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function checkedWarmStart(instance: Ps1Instance, outcome: SolveOutcome, options: NativeSolveOptions) {
  if (outcome.status !== "FEASIBLE" || !outcome.submission) return undefined;
  const csv = writeSubmission(outcome.submission);
  const submission = parseSubmission({ access: csv["SCHEDULE_ACCESS.csv"],
    occupancy: csv["SCHEDULE_OCCUPANCY.csv"], results: csv["RESULTS.csv"] });
  const validation = validate(instance, submission, undefined, options.disruptions ?? []);
  return validation.feasible && hasPins(submission, options.pins ?? []) ? { submission, validation } : undefined;
}

/** Full CP-SAT portfolio solve, with a validated heuristic as an initial bound. */
export async function solveNative(instance: Ps1Instance, options: NativeSolveOptions,
  configuration: NativeSolverConfiguration = {}): Promise<SolveOutcome> {
  const started = performance.now();
  if (options.signal?.aborted) throw abortError();
  const seconds = configuration.seconds ?? 60;
  // The selected host has 32 vCPUs. Start at 16 cooperative search workers;
  // compare 8/16/32 on that host before assuming all vCPUs improve this model.
  const workers = configuration.workers ?? Math.min(16, availableParallelism());
  const warmStartMs = configuration.warmStartMs ?? 1_000;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 ||
    !Number.isInteger(workers) || workers < 1 || workers > 32 ||
    !Number.isFinite(warmStartMs) || warmStartMs < 0 || warmStartMs > 5_000) {
    throw new Error("Invalid internal native solver budget.");
  }
  // Reject dense sharing graphs before constructing even the heuristic. The
  // request's activity-week limit alone does not bound possession assignments.
  cpSatPayload(instance, { scenario: options.scenario, seconds, workers,
    pins: options.pins, disruptions: options.disruptions });
  const heuristic = solveInstance(instance, { scenario: options.scenario,
    pins: options.pins, disruptions: options.disruptions,
    optimizationBudget: { maxTimeMs: warmStartMs, seed: 1 } });
  if (heuristic.status === "INVALID_INSTANCE") return heuristic;
  if (options.signal?.aborted) throw abortError();
  const warm = checkedWarmStart(instance, heuristic, options);
  const payload = cpSatPayload(instance, { scenario: options.scenario, seconds, workers,
    pins: options.pins, disruptions: options.disruptions, incumbent: warm?.submission });
  // Missing incumbent is intentionally allowed: CP-SAT must attempt cases the
  // greedy constructor cannot solve, not filter them out of its workload.
  const processResult = await runNativeProcess(payload, { python: configuration.python ?? "python3",
    timeoutMs: seconds * 1_000 + 15_000, signal: options.signal });
  const native = processResult.timedOut ? undefined :
    checkedCpSatResult(payload, processResult.value, options.disruptions);
  let selected: { submission: Submission; validation: NonNullable<SolveOutcome["validation"]> } | undefined = warm;
  let incumbentSource: NonNullable<SolveDiagnostics["solver"]>["incumbentSource"] = warm ? "heuristic" : "none";
  // The score permits zero-cost extra accesses. On a score tie, keep the
  // schedule with fewer accesses while retaining the full native proof below.
  if (native?.submission && native.report && (!selected ||
    native.report.objectiveScore! < selected.validation.objectiveScore! ||
    (native.report.objectiveScore === selected.validation.objectiveScore &&
      native.submission.access.length <= selected.submission.access.length))) {
    selected = { submission: native.submission, validation: native.report };
    incumbentSource = "cp-sat";
  }
  if (selected && (native?.status === "INFEASIBLE" ||
    (native && native.bound > selected.validation.objectiveScore! + 1e-6))) {
    throw new Error("CP-SAT's proof contradicts a locally validated schedule.");
  }
  const bestBound = native && native.status !== "INFEASIBLE" ? native.bound : null;
  const absoluteGap = selected && bestBound !== null ? Math.max(0, selected.validation.objectiveScore! - bestBound) : null;
  const warnings: string[] = [];
  if (processResult.timedOut) warnings.push("The native process reached its wall-time limit; any returned schedule is the validated heuristic incumbent.");
  if (native?.status === "UNKNOWN") warnings.push("CP-SAT exhausted its budget without a new schedule or infeasibility proof; a validated incumbent is retained when available.");
  if (!selected && native?.status !== "INFEASIBLE") warnings.push("No complete locally conforming schedule was found within the budget. This is not a proof of infeasibility.");
  if (native?.status === "INFEASIBLE") warnings.push("CP-SAT proved infeasibility for the encoded local model and requested pins/disruptions.");
  return {
    status: selected ? "FEASIBLE" : "INFEASIBLE",
    ...(selected ?? {}),
    diagnostics: {
      startsTried: heuristic.diagnostics.startsTried,
      candidatesEvaluated: heuristic.diagnostics.candidatesEvaluated + (native?.submission ? 1 : 0),
      elapsedMs: performance.now() - started, warnings,
      rejectedPins: selected ? [] : heuristic.diagnostics.rejectedPins,
      solver: {
        engine: "OR-Tools CP-SAT", version: native?.ortoolsVersion,
        status: native?.status ?? "UNKNOWN", scope: "full-local-model", workers, searchSeconds: seconds,
        bestBound, absoluteGap,
        relativeGap: selected && absoluteGap !== null ? absoluteGap / Math.max(1, Math.abs(selected.validation.objectiveScore!)) : null,
        nativeSolveMs: native?.solveMs ?? null, incumbentSource,
      },
    },
  };
}
