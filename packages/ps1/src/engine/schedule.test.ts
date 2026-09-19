// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "../io/load";
import { scheduleInstance, solveInstance } from "./schedule";
import { validate } from "./validate";
import { writeSubmission } from "../io/write";
import type { AccessType, NatureOfWorks, Ps1Instance, Scenario } from "../types/ps1";

const instance = loadInstance(
  Object.fromEntries(
    PS1_FILES.map((n) => [n, readFileSync(resolve("packages/ps1/data/public", n), "utf8")]),
  ),
);
const publicOutcomes = Object.fromEntries((["A", "B", "C"] as const)
  .map((scenario) => [scenario, solveInstance(instance, { scenario })]));

/**
 * The mandatory gate first. The brief is explicit that full delivery of every
 * activity is checked before any quality metric, so a schedule that scores well
 * while dropping work scores nothing at all.
 */
describe.each(["A", "B", "C"] as Scenario[])("scenario %s", (scenario) => {
  const submission = publicOutcomes[scenario].submission!;
  const report = validate(instance, submission);

  it("schedules every activity", () => {
    const scheduled = new Set(submission.access.map((row) => row.activityId));
    expect(scheduled.size).toBe(instance.activities.length);
  });

  it("delivers each activity's full workload", () => {
    const short = instance.activities.filter((activity) => {
      const yielded = submission.access
        .filter((row) => row.activityId === activity.activityId)
        .reduce((sum, row) => sum + (row.eclo === 1 ? 1.5 : 1), 0);
      return yielded + 1e-9 < activity.totalAccesses;
    });
    expect(short.map((a) => a.activityId)).toEqual([]);
  });

  it("produces a feasible submission", () => {
    expect(report.hardViolations).toEqual([]);
    expect(report.feasible).toBe(true);
  });

  it("gives every activity at most one access per week", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const row of submission.access) {
      const key = `${row.activityId}|${row.week}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  it("reports one scenario per RESULTS and one row per contract", () => {
    expect(new Set(submission.results.map((r) => r.scenario))).toEqual(new Set([scenario]));
    expect(submission.results).toHaveLength(instance.contracts.length);
  });
});

describe("scenario levers differ as the brief prices them", () => {
  const a = publicOutcomes.A.validation!;
  const b = publicOutcomes.B.validation!;
  const c = publicOutcomes.C.validation!;

  it("never uses ECLO in A, where it is hard-forbidden", () => {
    expect(a.softScores.ecloNightsTotal).toBe(0);
  });

  it("uses ECLO in B, where dates are rigid and nights are the currency", () => {
    expect(b.softScores.ecloNightsTotal).toBeGreaterThan(0);
  });

  it("holds A to nominal capacity", () => {
    expect(a.softScores.excessAccessNightsTotal).toBe(0);
  });

  it("scores each scenario with its own objective", () => {
    for (const report of [a, b, c]) expect(report.objectiveScore).toBeGreaterThanOrEqual(0);
    // B carries no overrun term at all: its dates are rigid by construction.
    expect(b.softScores.overrunDaysTotal).toBe(0);
  });
});

describe("deterministic multi-start optimisation", () => {
  it.each([
    // Closure-aware construction is measured separately from the old schedule
    // whose 25.2 score passed a checker that omitted external closures.
    ["A", 32.2],
    ["B", 30],
    ["C", 32.2],
  ] as const)("keeps public Scenario %s at or below %s", (scenario, ceiling) => {
    const outcome = publicOutcomes[scenario];
    expect(outcome.status).toBe("FEASIBLE");
    expect(outcome.validation?.objectiveScore).toBeLessThanOrEqual(ceiling);
    expect(outcome.diagnostics.startsTried).toBe(24);
    expect(outcome.diagnostics.candidatesEvaluated).toBeGreaterThanOrEqual(24);
  });

  it("returns byte-identical files for identical inputs", () => {
    const first = solveInstance(instance, { scenario: "A" });
    const second = solveInstance(instance, { scenario: "A" });
    expect(first.status).toBe("FEASIBLE");
    expect(second.status).toBe("FEASIBLE");
    expect(writeSubmission(first.submission!)).toEqual(writeSubmission(second.submission!));
  });

  it("never emits an access beyond the declared horizon", () => {
    const outcome = solveInstance(instance, { scenario: "C" });
    expect(
      outcome.submission?.access.every((row) => row.week <= instance.parameters.horizonWeeks),
    ).toBe(true);
  });
});

interface ClosureWork {
  id: string;
  accessType: AccessType;
  nature: NatureOfWorks;
  start: string;
  end?: string;
  workload?: number;
}

function closureInstance(work: ClosureWork[]): Ps1Instance {
  return {
    ...instance,
    locationSupply: instance.locationSupply.map((location) => ({ ...location, supplyCapacity: 3 })),
    contracts: work.map((job, index) => ({
      ...instance.contracts[0], contractNumber: `TEST${index + 1}`,
      natureOfActivity: job.nature, accessType: job.accessType,
      plannedCompletionDate: "2027-08-01", contractPriority: 2,
      numberOfWorkfronts: 1, numberOfMaximumAccessPerWeek: job.nature === "Live" ? 2 : 3,
    })),
    activities: work.map((job, index) => ({
      ...instance.activities[0], activityId: job.id, contractNumber: `TEST${index + 1}`,
      startLocationId: job.start, endLocationId: job.end ?? job.start,
      totalAccesses: job.workload ?? 1, plannedStartDate: "2027-01-04",
      predecessorActivityId: null, activityPriority: 2,
    })),
  };
}

describe("closure-aware construction", () => {
  it.each([
    ["Consist buffer", "Non-live (Consist)", "SEC:ALP:S02_S03:EB", "SEC:ALP:S03_S04:EB"],
    ["Live opposite bound", "Live", "SEC:ALP:H01_H02:EB", "SEC:ALP:H01_H02:WB"],
    ["Live interchange", "Live", "SEC:ALP:H01_H02:EB", "SEC:BET:H01_H02:EB"],
    ["Live buffer on the crossed line", "Live", "SEC:ALP:H01_H02:EB", "SEC:BET:S13_S14:EB"],
  ] as const)("separates external work inside a %s", (_name, nature, start, target) => {
    const fixture = closureInstance([
      { id: "HOST", accessType: "PM", nature, start },
      { id: "OTHER", accessType: "C", nature: "Non-live (Others)", start: target },
    ]);
    const result = scheduleInstance(fixture, { scenario: "A", activityOrder: ["HOST", "OTHER"] });
    expect(result.access.map((row) => [row.activityId, row.week])).toEqual([["HOST", 1], ["OTHER", 2]]);
    expect(validate(fixture, result).hardViolations).toEqual([]);
  });

  it("retains a legal PC/C shared possession", () => {
    const fixture = closureInstance([
      { id: "HOST", accessType: "PC", nature: "Non-live (Consist)", start: "SEC:ALP:S02_S03:EB" },
      { id: "COWORKER", accessType: "C", nature: "Non-live (Others)", start: "SEC:ALP:S02_S03:EB" },
    ]);
    const result = scheduleInstance(fixture, { scenario: "A" });
    expect(result.access.every((row) => row.week === 1)).toBe(true);
    expect(validate(fixture, result).hardViolations).toEqual([]);
  });

  it("keeps a Non-live PC and C buffer-free even without a shared group", () => {
    const fixture = closureInstance([
      { id: "HOST", accessType: "PC", nature: "Non-live (Consist)", start: "SEC:ALP:S02_S03:EB" },
      { id: "COWORKER", accessType: "C", nature: "Non-live (Others)", start: "SEC:ALP:S04_H01:EB" },
    ]);
    const result = scheduleInstance(fixture, { scenario: "A", activityOrder: ["HOST", "COWORKER"] });
    expect(result.access.map((row) => row.week)).toEqual([1, 1]);
    expect(validate(fixture, result).hardViolations).toEqual([]);
  });

  it("separates hosts whose buffers overlap without touching either worksite", () => {
    const fixture = closureInstance([
      { id: "LEFT", accessType: "PC", nature: "Non-live (Consist)", start: "SEC:ALP:S01_S02:EB" },
      { id: "RIGHT", accessType: "PC", nature: "Non-live (Consist)", start: "SEC:ALP:S03_S04:EB" },
    ]);
    const result = scheduleInstance(fixture, { scenario: "A", activityOrder: ["LEFT", "RIGHT"] });
    expect(result.access.map((row) => row.week)).toEqual([1, 2]);
    expect(validate(fixture, result).hardViolations).toEqual([]);
  });

  it("preserves two PC possessions connected transitively by a C bridge", () => {
    const fixture = closureInstance([
      { id: "LEFT", accessType: "PC", nature: "Non-live (Consist)", start: "SEC:ALP:S01_S02:EB" },
      { id: "RIGHT", accessType: "PC", nature: "Non-live (Consist)", start: "SEC:ALP:S03_S04:EB" },
      { id: "BRIDGE", accessType: "C", nature: "Non-live (Others)", start: "SEC:ALP:S02_S03:EB" },
    ]);
    const result = scheduleInstance(fixture, { scenario: "A", activityOrder: ["BRIDGE", "LEFT", "RIGHT"] });
    expect(result.access.map((row) => row.week)).toEqual([1, 1, 1]);
    const leftLocations = new Set(result.occupancy.filter((row) => row.activityId === "LEFT").map((row) => row.locationId));
    expect(result.occupancy.filter((row) => row.activityId === "RIGHT")
      .some((row) => leftLocations.has(row.locationId))).toBe(false);
    expect(validate(fixture, result).hardViolations).toEqual([]);
  });

  it("keeps Non-live work on its own line", () => {
    const fixture = closureInstance([
      { id: "ALPHA", accessType: "PC", nature: "Non-live (Consist)", start: "SEC:ALP:H01_H02:EB" },
      { id: "BETA", accessType: "C", nature: "Non-live (Others)", start: "SEC:BET:H01_H02:EB" },
    ]);
    const result = scheduleInstance(fixture, { scenario: "A" });
    expect(result.access.map((row) => row.week)).toEqual([1, 1]);
    expect(validate(fixture, result).hardViolations).toEqual([]);
  });

  it.each([
    ["Live", "SEC:ALP:H01_H02:EB", "SEC:BET:H01_H02:WB"],
    ["Non-live (Consist)", "SEC:ALP:S02_S03:EB", "SEC:ALP:S03_S04:EB"],
  ] as const)("protects a %s C activity from external PM work", (nature, start, target) => {
    const fixture = closureInstance([
      { id: "CWORK", accessType: "C", nature, start },
      { id: "PMWORK", accessType: "PM", nature: "Non-live (Others)", start: target },
    ]);
    const result = scheduleInstance(fixture, { scenario: "A", activityOrder: ["CWORK", "PMWORK"] });
    expect(result.access.map((row) => [row.activityId, row.week])).toEqual([["CWORK", 1], ["PMWORK", 2]]);
    expect(validate(fixture, result).hardViolations).toEqual([]);
  });

  it("keeps a pinned closure and delivers all other work in clear weeks", () => {
    const fixture = closureInstance([
      { id: "HOST", accessType: "PM", nature: "Live", start: "SEC:ALP:H01_H02:EB" },
      { id: "OTHER", accessType: "C", nature: "Non-live (Others)", start: "SEC:BET:H01_H02:EB", workload: 2 },
    ]);
    const result = scheduleInstance(fixture, { scenario: "A", pins: [{ activityId: "HOST", week: 2 }] });
    expect(result.rejectedPins).toEqual([]);
    expect(result.access.filter((row) => row.activityId === "HOST").map((row) => row.week)).toEqual([2]);
    expect(result.access.filter((row) => row.activityId === "OTHER").map((row) => row.week)).toEqual([1, 3]);
    expect(validate(fixture, result).hardViolations).toEqual([]);
  });

  it("rejects conflicting closure pins instead of claiming to honour both", () => {
    const fixture = closureInstance([
      { id: "HOST", accessType: "PM", nature: "Live", start: "SEC:ALP:H01_H02:EB" },
      { id: "OTHER", accessType: "C", nature: "Non-live (Others)", start: "SEC:BET:H01_H02:EB" },
    ]);
    const result = solveInstance(fixture, { scenario: "A", pins: [
      { activityId: "HOST", week: 1 }, { activityId: "OTHER", week: 1 },
    ], optimizationBudget: { starts: 1, maxNeighbourEvaluations: 0 } });
    expect(result.status).toBe("INFEASIBLE");
    expect(result.diagnostics.rejectedPins).toEqual([expect.objectContaining({ activityId: "OTHER", week: 1 })]);
  });
});
