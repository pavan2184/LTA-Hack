// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { parseSubmission } from "@railplan/ps1/io/submission";
import { validate } from "@railplan/ps1/engine/validate";
import { nativePayload, runNativeSolver, type NativeOptions, type NativeResult } from "./cp-sat";
import { cpSatPayload } from "../../../src/lib/ps1/cp-sat-model";

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock("node:child_process", () => ({ spawnSync }));

const instance = loadInstance(Object.fromEntries(PS1_FILES.map((name) => [
  name, readFileSync(resolve("packages/ps1/data/public", name), "utf8"),
])));
const fixture = parseSubmission({
  access: readFileSync(resolve("packages/ps1/data/results/B/SCHEDULE_ACCESS.csv"), "utf8"),
  occupancy: readFileSync(resolve("packages/ps1/data/results/B/SCHEDULE_OCCUPANCY.csv"), "utf8"),
  results: readFileSync(resolve("packages/ps1/data/results/B/RESULTS.csv"), "utf8"),
});
const fixtureScore = validate(instance, fixture).objectiveScore!;

/** Mock only the process boundary; decoding, CSV parsing and checking stay real. */
function workerReply(overrides: Partial<NativeResult> = {}) {
  spawnSync.mockImplementation((_python: string, _args: string[], options: { input: string }) => {
    const payload = JSON.parse(options.input) as ReturnType<typeof nativePayload>;
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify({
        schema: payload.schema, digest: payload.digest, scenario: payload.scenario,
        scope: "full", status: "FEASIBLE", objective: fixtureScore, bound: 0,
        ortoolsVersion: "mock-test",
        access: fixture.access, buildMs: 2, solveMs: 3, modelAndSolveMs: 5,
        ...overrides,
      }),
    };
  });
}

beforeEach(() => {
  spawnSync.mockReset();
  workerReply();
});

describe("native payload boundary", () => {
  it("omits the incumbent in a serialized cold payload", () => {
    const payload = JSON.parse(JSON.stringify(nativePayload(instance, "B", 60, { workers: 8, seed: 17 })));
    expect(payload).not.toHaveProperty("incumbent");
    expect(payload).not.toHaveProperty("movableActivityIds");
    expect(payload).toMatchObject({ scenario: "B", seconds: 60, workers: 8, seed: 17 });
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("uses the service's canonical payload and digest for a benchmark profile", () => {
    const options = { workers: 8, seed: 17, profile: "lns" as const };
    expect(nativePayload(instance, "B", 60, options)).toEqual(
      cpSatPayload(instance, { ...options, scenario: "B", seconds: 60 }),
    );
  });

  it("keeps tightening opt-in and rejects applying its label to SCIP", () => {
    expect(nativePayload(instance, "B", 60)).not.toHaveProperty("formulation");
    expect(nativePayload(instance, "B", 60, { formulation: "tight" })).toHaveProperty("formulation", "tight");
    expect(() => runNativeSolver("mock-python", "scip", instance, "B", 60, { formulation: "tight" }))
      .toThrow(/requires CP-SAT/);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid seconds %s before spawning", (seconds) => {
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", seconds)).toThrow(/Invalid native/);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it.each([
    { workers: 0 }, { workers: 257 }, { workers: 1.5 }, { workers: Number.NaN },
    { seed: -1 }, { seed: 2 ** 31 }, { seed: 1.5 }, { seed: Number.NaN },
  ] satisfies NativeOptions[])("rejects invalid search controls %j", (options) => {
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", 60, options)).toThrow(/Invalid native/);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("rejects an invalid warm incumbent and a repair with no incumbent", () => {
    expect(() => nativePayload(instance, "B", 60, {
      incumbent: { ...fixture, access: [] },
    })).toThrow(/incumbent.*validation/i);
    expect(() => nativePayload(instance, "A", 60, { incumbent: fixture })).toThrow(/scenario mismatch/i);
    expect(() => nativePayload(instance, "B", 60, { movableActivityIds: [] })).toThrow(/requires an incumbent/i);
  });

  it.each([["unknown"], [fixture.access[0].activityId, fixture.access[0].activityId]])(
    "rejects unknown or repeated movable IDs so repair scope cannot be mislabelled: %j", (...movableActivityIds) => {
      expect(() => nativePayload(instance, "B", 60, { incumbent: fixture, movableActivityIds })).toThrow(/movable activity IDs/);
    },
  );

  it("forwards explicit operator pins alongside a validated incumbent", () => {
    const { activityId, week, eclo } = fixture.access[0];
    const pins = [{ activityId, week, eclo }];
    const payload = nativePayload(instance, "B", 60, { incumbent: fixture, pins });
    expect(payload.pins).toEqual(pins);
  });

  it("rejects a warm incumbent that does not satisfy the operator's pin", () => {
    const { activityId, week, eclo } = fixture.access[0];
    expect(() => nativePayload(instance, "B", 60, {
      incumbent: fixture, pins: [{ activityId, week, eclo: eclo === 0 ? 1 : 0 }],
    })).toThrow(/incumbent.*validation/i);
  });

  it.each([
    { activityId: "unknown", week: 1 },
    { activityId: fixture.access[0].activityId, week: 0 },
    { activityId: fixture.access[0].activityId, week: instance.parameters.horizonWeeks + 1 },
  ])("rejects an invalid operator pin %j before spawning", (pin) => {
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", 60, { pins: [pin] })).toThrow(/solver pin/);
    expect(spawnSync).not.toHaveBeenCalled();
  });
});

describe("native result validation", () => {
  it.each(["cpsat", "scip"] as const)("decodes and checks a valid %s candidate through the official CSVs", (engine) => {
    const result = runNativeSolver("mock-python", engine, instance, "B", 60, { workers: 8, seed: 17 });
    expect(result.submission).toBeDefined();
    expect(validate(instance, result.submission!)).toMatchObject({ feasible: true, objectiveScore: fixtureScore });
    expect(result.submission!.access).toEqual(fixture.access);
    expect(result.submission!.results).toEqual(fixture.results);
    expect(result.engine).toBe(engine);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.payloadMs).toBeGreaterThanOrEqual(0);
    expect(result.validationMs).toBeGreaterThanOrEqual(0);
    expect(spawnSync).toHaveBeenCalledOnce();
    expect(spawnSync.mock.calls[0][1]).toEqual([
      resolve(`scripts/ps1/benchmark/${engine === "cpsat" ? "cp_sat" : "scip"}.py`),
    ]);
    expect(JSON.parse(spawnSync.mock.calls[0][2].input)).toMatchObject({ seconds: 60, workers: 8, seed: 17 });
  });

  it.each([
    { digest: "another-instance" },
    { scenario: "C" as const },
    { schema: "another-schema" },
  ])("rejects inconsistent native provenance %j", (overrides) => {
    workerReply(overrides);
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", 60)).toThrow(/provenance/i);
  });

  it.each([null, fixtureScore + 1])("rejects objective %s when it disagrees with the checked CSVs", (objective) => {
    workerReply({ objective });
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", 60)).toThrow(/objective/i);
  });

  it("rejects missing workload even if the native process claims feasibility", () => {
    workerReply({ access: fixture.access.filter((row) => row.activityId !== fixture.access[0].activityId) });
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", 60)).toThrow(/local CSV/i);
  });

  it("rejects duplicate activity-week rows rather than counting them as extra work", () => {
    workerReply({ access: [...fixture.access, fixture.access[0]] });
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", 60)).toThrow(/local CSV/i);
  });

  it("rejects a feasible native schedule that ignores an explicit operator pin", () => {
    const { activityId, week, eclo } = fixture.access[0];
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", 60, {
      pins: [{ activityId, week, eclo: eclo === 0 ? 1 : 0 }],
    })).toThrow(/pin or objective validation/i);
  });

  it("returns no candidate for UNKNOWN even when a warm incumbent was supplied", () => {
    workerReply({ status: "UNKNOWN", objective: null, access: [] });
    const result = runNativeSolver("mock-python", "cpsat", instance, "B", 60, { incumbent: fixture });
    expect(result.status).toBe("UNKNOWN");
    expect(result.objective).toBeNull();
    expect(result.submission).toBeUndefined();
  });

  it.each(["MODEL_INVALID", "ABNORMAL", "UNBOUNDED"])("surfaces native status %s as a failure", (status) => {
    workerReply({ status, objective: null, access: [] });
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", 60)).toThrow(/invalid result/i);
  });

  it("rejects a repair result labelled as a full-model proof", () => {
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", 60, {
      incumbent: fixture, movableActivityIds: [fixture.access[0].activityId],
    })).toThrow(/provenance/i);
  });

  it("rejects a claimed optimum whose lower bound does not meet its score", () => {
    workerReply({ status: "OPTIMAL", bound: fixtureScore - 1 });
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", 60)).toThrow(/inconsistent objective bound/i);
  });

  it("surfaces a child-process timeout without manufacturing a result", () => {
    spawnSync.mockReturnValue({ status: null, error: new Error("native timeout"), stdout: "", stderr: "" });
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", 60)).toThrow("native timeout");
  });

  it("uses an optional wall guard without changing the serialized solver budget", () => {
    runNativeSolver("mock-python", "cpsat", instance, "B", 5, {}, 7000);
    const options = spawnSync.mock.calls[0][2];
    expect(options.timeout).toBeGreaterThan(0);
    expect(options.timeout).toBeLessThanOrEqual(7000);
    expect(options.killSignal).toBe("SIGKILL");
    expect(JSON.parse(options.input).seconds).toBe(5);
  });

  it.each([0, -1, Number.NaN, Infinity])("rejects invalid process wall limits %s", (limit) => {
    expect(() => runNativeSolver("mock-python", "cpsat", instance, "B", 5, {}, limit)).toThrow(/wall limit/);
    expect(spawnSync).not.toHaveBeenCalled();
  });
});
