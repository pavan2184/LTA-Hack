// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadInstance, PS1_FILES } from "../io/load";
import { parseSubmission } from "../io/submission";
import { writeSubmission } from "../io/write";
import type { Ps1Instance, Submission } from "../types/ps1";
import { buildNetwork, closureFor, expandSpan } from "./network";
import { scheduleInstance, solveInstance } from "./schedule";
import { validate } from "./validate";

function load(name: string): Ps1Instance {
  return loadInstance(Object.fromEntries(PS1_FILES.map((file) => [
    file, readFileSync(resolve("packages/ps1/data", name, file), "utf8"),
  ])));
}

function checkExport(instance: Ps1Instance, submission: Submission) {
  const files = writeSubmission(submission);
  const parsed = parseSubmission({
    access: files["SCHEDULE_ACCESS.csv"],
    occupancy: files["SCHEDULE_OCCUPANCY.csv"],
    results: files["RESULTS.csv"],
  });
  expect(validate(instance, parsed).hardViolations).toEqual([]);
  expect(new Set(parsed.results.map((row) => row.scenario))).toEqual(new Set([submission.scenario]));
}

describe("validated candidate reuse", () => {
  it.each(["06-mixed-120", "12-mixed-240"])("avoids unnecessary B/C capacity costs for the co-worker variant of %s", (name) => {
    const instance = load(`synthetic/${name}`);
    // Isolate nominal-capacity candidate reuse at both workload scales. The
    // original mixed-host datasets now have unresolved closure-constrained
    // workloads, covered without mutation in datasets.test.ts.
    instance.contracts = instance.contracts.map((contract) => ({ ...contract,
      accessType: "C", natureOfActivity: "Non-live (Others)", numberOfMaximumAccessPerWeek: 3 }));
    const a = solveInstance(instance, { scenario: "A" });
    expect(a.validation?.objectiveScore).toBe(0);
    for (const scenario of ["B", "C"] as const) {
      const outcome = solveInstance(instance, { scenario, initialCandidates: [a.submission!] });
      expect(outcome.status).toBe("FEASIBLE");
      expect(outcome.validation?.objectiveScore).toBe(0);
      checkExport(instance, outcome.submission!);
      // A caller solving just this policy still tries nominal-supply alternatives.
      expect(solveInstance(instance, { scenario }).validation?.objectiveScore).toBe(0);
    }
  }, 20_000);

  it("rejects a cheaper A candidate that misses B's hard deadlines", () => {
    const instance = load("public");
    const a = solveInstance(instance, { scenario: "A" });
    const original = JSON.stringify(a.submission);
    const b = solveInstance(instance, { scenario: "B", initialCandidates: [a.submission!] });
    expect(a.validation?.softScores.overrunDaysTotal).toBeGreaterThan(0);
    expect(b.status).toBe("FEASIBLE");
    expect(b.validation?.softScores.overrunDaysTotal).toBe(0);
    expect(b.validation?.objectiveScore).toBeGreaterThan(0);
    expect(JSON.stringify(a.submission)).toBe(original);
    checkExport(instance, b.submission!);
  });

  it("does not reuse a schedule that violates the new disruption", () => {
    const instance = load("synthetic/01-small-demo");
    const baseline = solveInstance(instance, { scenario: "C" }).submission!;
    const occupied = baseline.occupancy[0];
    const disruptions = [{ locationId: occupied.locationId, fromWeek: occupied.week, toWeek: occupied.week, capacity: 0 }];
    const outcome = solveInstance(instance, { scenario: "C", initialCandidates: [baseline], disruptions });
    expect(outcome.status).toBe("FEASIBLE");
    expect(validate(instance, outcome.submission!, buildNetwork(instance), disruptions).hardViolations).toEqual([]);
    expect(outcome.submission!.occupancy.some((row) => row.locationId === occupied.locationId && row.week === occupied.week)).toBe(false);
  });

  it("preserves an operator pin through reused candidates and reconstruction", () => {
    const instance = load("public");
    const baseline = solveInstance(instance, { scenario: "A" }).submission!;
    const pins = [{ activityId: "A003", week: 20, eclo: 0 as const }];
    const outcome = solveInstance(instance, { scenario: "A", initialCandidates: [baseline], pins });
    expect(outcome.status).toBe("FEASIBLE");
    expect(outcome.submission!.access).toContainEqual(expect.objectContaining(pins[0]));
    expect(outcome.validation?.hardViolations).toEqual([]);
  });
});

describe("Scenario C ECLO construction", () => {
  it("buys a legal window instead of rejecting all separated-window candidates", () => {
    const instance = load("synthetic/09-separated-eclo-windows");
    const b = solveInstance(instance, { scenario: "B" });
    const c = solveInstance(instance, { scenario: "C", initialCandidates: [b.submission!] });
    expect(c.status).toBe("FEASIBLE");
    expect(c.validation?.objectiveScore).toBeLessThan(3640);
    expect(c.validation?.softScores.ecloNightsTotal).toBeGreaterThan(0);
    expect(c.validation?.softScores.overrunDaysTotal).toBeGreaterThan(0);
    checkExport(instance, c.submission!);
  });

  it("allows different two-week windows on independent lines", () => {
    const instance = load("synthetic/09-separated-eclo-windows");
    instance.activities = instance.activities.filter((a) => ["09-A001", "09-A004"].includes(a.activityId));
    instance.contracts = instance.contracts.filter((c) => instance.activities.some((a) => a.contractNumber === c.contractNumber));
    const outcome = solveInstance(instance, { scenario: "C" });
    expect(outcome.status).toBe("FEASIBLE");
    expect(outcome.validation?.softScores.overrunDaysTotal).toBe(0);
    expect(outcome.validation?.softScores.ecloNightsTotal).toBe(4);
    expect(outcome.validation?.objectiveScore).toBe(20);
    checkExport(instance, outcome.submission!);
  });

  it("counts a Live interchange closure against both lines' windows", () => {
    const instance = load("synthetic/09-separated-eclo-windows");
    instance.activities = instance.activities.filter((a) => ["09-A001", "09-A004"].includes(a.activityId));
    instance.contracts = instance.contracts.filter((c) => instance.activities.some((a) => a.contractNumber === c.contractNumber));
    instance.activities[0].startLocationId = "SEC:ALP:H01_H02:EB";
    instance.activities[0].endLocationId = "SEC:ALP:H01_H02:EB";
    instance.contracts[0].natureOfActivity = "Live";
    instance.contracts[0].numberOfMaximumAccessPerWeek = 2;
    const network = buildNetwork(instance);
    const outcome = scheduleInstance(instance, { scenario: "C", constructionSeed: 1 }, network);
    expect(validate(instance, outcome).hardViolations).toEqual([]);
    const weeksByLine = new Map<string, number[]>();
    for (const row of outcome.access.filter((r) => r.eclo)) {
      const activity = instance.activities.find((a) => a.activityId === row.activityId)!;
      const contract = instance.contracts.find((c) => c.contractNumber === activity.contractNumber)!;
      for (const location of closureFor(network, expandSpan(network, activity.startLocationId, activity.endLocationId), contract.natureOfActivity)) {
        const line = network.supply.get(location)!.lineCode;
        weeksByLine.set(line, [...(weeksByLine.get(line) ?? []), row.week]);
      }
    }
    expect([...weeksByLine.keys()].sort()).toEqual(["ALP", "BET"]);
    for (const weeks of weeksByLine.values()) expect(Math.max(...weeks) - Math.min(...weeks)).toBeLessThan(2);
    expect(outcome.access.filter((row) => row.activityId === "09-A004").every((row) => !row.eclo)).toBe(true);
  });
});
