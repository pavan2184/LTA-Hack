// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "../io/load";
import { scheduleInstance } from "./schedule";
import { validate } from "./validate";
import type { Scenario } from "../types/ps1";

const instance = loadInstance(
  Object.fromEntries(
    PS1_FILES.map((n) => [n, readFileSync(resolve("packages/ps1/data/public", n), "utf8")]),
  ),
);

/**
 * The mandatory gate first. The brief is explicit that full delivery of every
 * activity is checked before any quality metric, so a schedule that scores well
 * while dropping work scores nothing at all.
 */
describe.each(["A", "B", "C"] as Scenario[])("scenario %s", (scenario) => {
  const submission = scheduleInstance(instance, { scenario });
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
  const a = validate(instance, scheduleInstance(instance, { scenario: "A" }));
  const b = validate(instance, scheduleInstance(instance, { scenario: "B" }));
  const c = validate(instance, scheduleInstance(instance, { scenario: "C" }));

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
