// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { parseSubmission } from "@railplan/ps1/io/submission";
import { resultsFor, solveInstance } from "@railplan/ps1/engine/schedule";
import { budgetedSearch } from "./budgeted-search";
import { runNativeSolver } from "./cp-sat";

const instance = loadInstance(Object.fromEntries(PS1_FILES.map((name) => [name,
  readFileSync(`packages/ps1/data/public/${name}`, "utf8")])));
const submission = parseSubmission({
  access: readFileSync("packages/ps1/data/results/B/SCHEDULE_ACCESS.csv", "utf8"),
  occupancy: readFileSync("packages/ps1/data/results/B/SCHEDULE_OCCUPANCY.csv", "utf8"),
  results: readFileSync("packages/ps1/data/results/B/RESULTS.csv", "utf8"),
});
const options = { python: "mock", seconds: 60, workers: 8, seed: 1, variant: "targeted" as const };
const warm = (() => ({ status: "FEASIBLE", submission })) as unknown as typeof solveInstance;

describe("equal-deadline native experiments", () => {
  it("never promotes a conditional repair optimum to a global proof", () => {
    let clock = 0;
    const native = vi.fn<typeof runNativeSolver>().mockImplementation((_p, _e, _i, _s, _t, opts) => {
      clock += 1000;
      const repair = !!opts?.movableActivityIds;
      return { status: repair ? "OPTIMAL" : "FEASIBLE", scope: repair ? "repair" : "full",
        objective: 30, bound: repair ? 30 : 0, submission } as ReturnType<typeof runNativeSolver>;
    });
    const result = budgetedSearch(instance, "B", options, { now: () => clock, warm, native });
    expect(result.status).toBe("FEASIBLE");
    expect(result.fullBound).toBe(0);
    expect(result.selectedScore).toBe(30);
    expect(result.stages.some((stage) => stage.scope === "repair")).toBe(true);
    expect(native).toHaveBeenCalledTimes(6);
  });

  it("counts warm start and earlier stages against one deadline and retains the incumbent on timeout", () => {
    let clock = 0;
    const warmTimed = (() => { clock += 1000; return { status: "FEASIBLE", submission }; }) as unknown as typeof solveInstance;
    const native = vi.fn<typeof runNativeSolver>().mockImplementation((_p, _e, _i, _s, _t, _o, wallMs) => {
      expect(wallMs).toBeLessThanOrEqual(59_000);
      clock = 60_000;
      throw new Error("ETIMEDOUT");
    });
    const result = budgetedSearch(instance, "B", options, { now: () => clock, warm: warmTimed, native });
    expect(native).toHaveBeenCalledOnce();
    expect(result.selectedScore).toBe(30);
    expect(result.errors).toHaveLength(1);
    expect(result.status).toBe("FEASIBLE");
    expect(result.warmMs).toBe(1000);
  });

  it("rejects an inconsistent full bound and never discards a valid warm start", () => {
    const native = (() => ({ status: "FEASIBLE", scope: "full", objective: 30,
      bound: 31, submission })) as unknown as typeof runNativeSolver;
    const result = budgetedSearch(instance, "B", { ...options, variant: "full" }, { warm, native });
    expect(result.selectedScore).toBe(30);
    expect(result.fullBound).toBe(0);
    expect(result.errors[0]).toContain("bound contradicts");
  });

  it("accepts a full proof and skips repairs after it", () => {
    const native = vi.fn<typeof runNativeSolver>().mockReturnValue({ status: "OPTIMAL", scope: "full",
      objective: 30, bound: 30, submission } as ReturnType<typeof runNativeSolver>);
    const result = budgetedSearch(instance, "B", options, { warm, native });
    expect(result.status).toBe("OPTIMAL");
    expect(result.fullBound).toBe(30);
    expect(native).toHaveBeenCalledOnce();
  });

  it("records a warm-start error and still tries a cold native model", () => {
    const native = vi.fn<typeof runNativeSolver>().mockReturnValue({ status: "OPTIMAL", scope: "full",
      objective: 30, bound: 30, submission } as ReturnType<typeof runNativeSolver>);
    const result = budgetedSearch(instance, "B", { ...options, variant: "full" }, {
      warm: () => { throw new Error("construction failed"); }, native,
    });
    expect(result.warmStatus).toBe("ERROR");
    expect(result.errors[0]).toContain("construction failed");
    expect(result.status).toBe("OPTIMAL");
    expect(native.mock.calls[0][5]?.incumbent).toBeUndefined();
  });

  it("flags a repair below an earlier full-model bound instead of clamping a contradictory gap", () => {
    const small = loadInstance(Object.fromEntries(PS1_FILES.map((name) => [name,
      readFileSync(`packages/ps1/data/synthetic/01-small-demo/${name}`, "utf8")])));
    const early = solveInstance(small, { scenario: "A" }).submission!;
    const late = structuredClone(early);
    for (const row of late.access) row.week += 12;
    for (const row of late.occupancy) row.week += 12;
    late.results = resultsFor(small, late.access, "A");
    const native = ((...args: Parameters<typeof runNativeSolver>) => args[5]?.movableActivityIds
      ? { status: "OPTIMAL", scope: "repair", objective: 0, bound: 0, submission: early }
      : { status: "UNKNOWN", scope: "full", objective: null, bound: 1 }) as unknown as typeof runNativeSolver;
    const result = budgetedSearch(small, "A", options, { native,
      warm: (() => ({ status: "FEASIBLE", submission: late })) as unknown as typeof solveInstance });
    expect(result.selectedScore).toBeGreaterThan(1);
    expect(result.errors.some((error) => error.includes("earlier full-model bound"))).toBe(true);
  });
});
