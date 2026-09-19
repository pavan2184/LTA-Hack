// @vitest-environment node
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import * as schedule from "@railplan/ps1/engine/schedule";
import type { SolveOutcome } from "@railplan/ps1/types/ps1";
import { cpSatPayload, type CpSatResult } from "./cp-sat-model";

const mocked = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocked.spawn }));
import { NativeSolverUnavailableError, runNativeProcess, solveNative } from "./server-solver";

const instance = loadInstance(Object.fromEntries(PS1_FILES.map((name) => [name,
  readFileSync(resolve("packages/ps1/data/synthetic/01-small-demo", name), "utf8")])));
const baseline = schedule.solveInstance(instance, { scenario: "A" });
type Payload = ReturnType<typeof cpSatPayload>;

function nativeResult(payload: Payload, changes: Partial<CpSatResult> = {}): CpSatResult {
  return { schema: payload.schema, digest: payload.digest, scenario: payload.scenario,
    scope: "full", status: "OPTIMAL", ortoolsVersion: "test", objective: 0,
    bound: 0, solveMs: 5, modelAndSolveMs: 10,
    access: baseline.submission!.access, ...changes };
}

function fakeProcess(response?: (payload: Payload, child: ChildProcessWithoutNullStreams) => void) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kill: vi.fn(() => { queueMicrotask(() => child.emit("close", null)); return true; }),
  }) as unknown as ChildProcessWithoutNullStreams;
  let input = "";
  child.stdin.on("data", (data: Buffer) => { input += data.toString(); });
  child.stdin.on("finish", () => queueMicrotask(() => response?.(JSON.parse(input), child)));
  mocked.spawn.mockReturnValueOnce(child);
  return child;
}

function reply(value: (payload: Payload) => unknown) {
  return fakeProcess((payload, child) => {
    (child.stdout as PassThrough).write(JSON.stringify(value(payload)));
    child.emit("close", 0);
  });
}

beforeEach(() => { mocked.spawn.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("native PS1 solver boundary", () => {
  it("validates native CSVs and exposes the full-model proof bound", async () => {
    reply((payload) => nativeResult(payload));
    const result = await solveNative(instance, { scenario: "A" }, { workers: 4, seconds: 2 });
    expect(result.status).toBe("FEASIBLE");
    expect(result.validation!.feasible).toBe(true);
    expect(result.diagnostics.solver).toMatchObject({ status: "OPTIMAL", scope: "full-local-model",
      workers: 4, searchSeconds: 2, bestBound: 0, relativeGap: 0, incumbentSource: "cp-sat" });
    expect(mocked.spawn).toHaveBeenCalledWith("python3", [resolve("scripts/ps1/benchmark/cp_sat.py")], expect.any(Object));
  });

  it("keeps a validated incumbent after CP-SAT returns UNKNOWN", async () => {
    reply((payload) => nativeResult(payload, { status: "UNKNOWN", objective: null, access: [] }));
    const result = await solveNative(instance, { scenario: "A" });
    expect(result.status).toBe("FEASIBLE");
    expect(result.diagnostics.solver).toMatchObject({ status: "UNKNOWN", incumbentSource: "heuristic" });
    expect(result.diagnostics.warnings.join(" ")).toContain("without a new schedule or infeasibility proof");
  });

  it("keeps the shorter equal-score incumbent with the native optimality proof", async () => {
    const rows = baseline.submission!.access.filter((row) => row.activityId === "01-A006");
    reply((payload) => nativeResult(payload, { access: [...baseline.submission!.access,
      { activityId: "01-A006", accessSeq: rows.length + 1,
        week: Math.max(...rows.map((row) => row.week)) + 1, eclo: 0, accessNight: 1 }] }));
    const result = await solveNative(instance, { scenario: "A" });
    expect(result.submission!.access).toHaveLength(baseline.submission!.access.length);
    expect(result.diagnostics.solver).toMatchObject({ status: "OPTIMAL", bestBound: 0,
      absoluteGap: 0, relativeGap: 0, incumbentSource: "heuristic" });
  });

  it("runs the full native model when the heuristic found no feasible schedule", async () => {
    vi.spyOn(schedule, "solveInstance").mockReturnValueOnce({ status: "INFEASIBLE",
      diagnostics: { startsTried: 1, candidatesEvaluated: 1, elapsedMs: 0, warnings: [], rejectedPins: [] } });
    reply((payload) => {
      expect(payload).not.toHaveProperty("incumbent");
      return nativeResult(payload);
    });
    const result = await solveNative(instance, { scenario: "A" });
    expect(result.status).toBe("FEASIBLE");
    expect(result.diagnostics.solver!.incumbentSource).toBe("cp-sat");
  });

  it("does not call budget exhaustion an infeasibility proof or return partial work", async () => {
    vi.spyOn(schedule, "solveInstance").mockReturnValueOnce({ status: "INFEASIBLE", submission: baseline.submission,
      diagnostics: { startsTried: 1, candidatesEvaluated: 1, elapsedMs: 0, warnings: [], rejectedPins: [] } });
    reply((payload) => nativeResult(payload, { status: "UNKNOWN", objective: null, access: [] }));
    const result = await solveNative(instance, { scenario: "A" });
    expect(result.status).toBe("INFEASIBLE");
    expect(result.submission).toBeUndefined();
    expect(result.diagnostics.warnings.join(" ")).toContain("not a proof of infeasibility");
    expect(result.diagnostics.solver!.incumbentSource).toBe("none");
  });

  it("rejects a native result whose score differs from the local checker", async () => {
    reply((payload) => nativeResult(payload, { status: "FEASIBLE", objective: 1 }));
    await expect(solveNative(instance, { scenario: "A" })).rejects.toThrow("objective validation");
  });

  it("rejects a claimed optimum with a nonzero gap", async () => {
    reply((payload) => nativeResult(payload, { objective: 1, bound: 0 }));
    await expect(solveNative(instance, { scenario: "A" })).rejects.toThrow("inconsistent objective bound");
  });

  it("rejects a native result that drops a requested access pin", async () => {
    const activityId = instance.activities[0].activityId;
    const week = Math.max(...baseline.submission!.access.filter((row) => row.activityId === activityId).map((row) => row.week)) + 1;
    reply((payload) => nativeResult(payload));
    await expect(solveNative(instance, { scenario: "A", pins: [{ activityId, week }] })).rejects.toThrow("pin or objective validation");
  });

  it("rejects a proof that contradicts the validated incumbent", async () => {
    reply((payload) => nativeResult(payload, { status: "INFEASIBLE", objective: null, access: [] }));
    await expect(solveNative(instance, { scenario: "A" })).rejects.toThrow("contradicts");
  });

  it("reports unavailable Python rather than silently using the heuristic", async () => {
    fakeProcess((_payload, child) => child.emit("error", Object.assign(new Error("missing"), { code: "ENOENT" })));
    await expect(solveNative(instance, { scenario: "A" })).rejects.toBeInstanceOf(NativeSolverUnavailableError);
  });

  it("reports unavailable OR-Tools without leaking a native traceback", async () => {
    fakeProcess((_payload, child) => {
      (child.stderr as PassThrough).write("private/path traceback\nModuleNotFoundError: No module named 'ortools'");
      child.emit("close", 1);
    });
    await expect(solveNative(instance, { scenario: "A" })).rejects.toBeInstanceOf(NativeSolverUnavailableError);
  });

  it("kills the native child on cancellation", async () => {
    const controller = new AbortController();
    const child = fakeProcess();
    const result = runNativeProcess(cpSatPayload(instance, { scenario: "A", seconds: 1 }),
      { python: "python3", timeoutMs: 10_000, signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("kills a hung native process at its wall-time limit", async () => {
    const child = fakeProcess();
    const result = await runNativeProcess(cpSatPayload(instance, { scenario: "A", seconds: 1 }),
      { python: "python3", timeoutMs: 1 });
    expect(result).toEqual({ timedOut: true });
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("rejects foreign solver provenance", async () => {
    reply((payload) => nativeResult(payload, { digest: "foreign" }));
    await expect(solveNative(instance, { scenario: "A" })).rejects.toThrow("provenance");
  });

  it("distinguishes a proved infeasible model when no incumbent exists", async () => {
    vi.spyOn(schedule, "solveInstance").mockReturnValueOnce({ status: "INFEASIBLE",
      diagnostics: { startsTried: 1, candidatesEvaluated: 1, elapsedMs: 0, warnings: [], rejectedPins: [] } } as SolveOutcome);
    reply((payload) => nativeResult(payload, { status: "INFEASIBLE", objective: null, access: [] }));
    const result = await solveNative(instance, { scenario: "A" });
    expect(result.diagnostics.solver!.status).toBe("INFEASIBLE");
    expect(result.diagnostics.warnings.join(" ")).toContain("proved infeasibility for the encoded local model");
  });
});
