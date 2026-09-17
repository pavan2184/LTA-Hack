// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "../io/load";
import { parseSubmission } from "../io/submission";
import { validate, weekEnd, weekOf, isoDate } from "./validate";

const instance = loadInstance(
  Object.fromEntries(
    PS1_FILES.map((n) => [n, readFileSync(resolve("packages/ps1/data/public", n), "utf8")]),
  ),
);
const dir = "packages/ps1/data/sample-submission";
const sample = parseSubmission({
  access: readFileSync(resolve(dir, "SCHEDULE_ACCESS.csv"), "utf8"),
  occupancy: readFileSync(resolve(dir, "SCHEDULE_OCCUPANCY.csv"), "utf8"),
  results: readFileSync(resolve(dir, "RESULTS.csv"), "utf8"),
});

describe("week arithmetic", () => {
  it("closes a week on the Sunday six days after its Monday", () => {
    expect(isoDate(weekEnd("2027-01-04", 1))).toBe("2027-01-10");
    expect(isoDate(weekEnd("2027-01-04", 23))).toBe("2027-06-13");
  });

  it("maps a date back to its week", () => {
    expect(weekOf("2027-01-04", "2027-01-04")).toBe(1);
    expect(weekOf("2027-01-04", "2027-01-10")).toBe(1);
    expect(weekOf("2027-01-04", "2027-01-11")).toBe(2);
  });
});

/**
 * The reference submission is the only published ground truth: the brief states
 * it is feasible with zero hard violations against this instance. Any rule of
 * mine that flags it is stricter than the real validator, and would make my
 * scheduler reject schedules the judges would have accepted.
 */
describe("the published reference submission", () => {
  const report = validate(instance, sample);

  it("validates as feasible with no hard violations", () => {
    expect(report.hardViolations).toEqual([]);
    expect(report.feasible).toBe(true);
  });

  it("reproduces its own RESULTS.csv completion dates and overruns", () => {
    const mismatches = sample.results.filter((row) => {
      const contract = instance.contracts.find(
        (c) => c.contractNumber === row.contractNumber,
      )!;
      const lastWeek = Math.max(
        ...sample.access
          .filter(
            (a) =>
              instance.activities.find((x) => x.activityId === a.activityId)!
                .contractNumber === row.contractNumber,
          )
          .map((a) => a.week),
      );
      const simulated = isoDate(weekEnd(instance.parameters.horizonStart, lastWeek));
      const planned = new Date(`${contract.plannedCompletionDate}T00:00:00Z`).getTime();
      const overrun = Math.max(
        0,
        Math.round((new Date(`${simulated}T00:00:00Z`).getTime() - planned) / 86_400_000),
      );
      return simulated !== row.simulatedCompletionDate || overrun !== row.overrunDays;
    });
    expect(mismatches).toEqual([]);
  });

  it("scores the overruns the sample declares", () => {
    // C006 14 days, C010 7, C014 7 — the only three overrunning contracts.
    expect(report.softScores.overrunDaysTotal).toBe(28);
    expect(report.softScores.contractsOverrunning).toBe(3);
    expect(report.softScores.ecloNightsTotal).toBe(0);
  });

  it("uses no capacity above supply", () => {
    expect(report.softScores.excessAccessNightsTotal).toBe(0);
  });

  it("publishes an objective score only when feasible", () => {
    expect(report.objectiveScore).toBeGreaterThanOrEqual(0);
    expect(report.formulaVersion).toBe("ps1-objective-v1");
  });
});

describe("hard rules reject what they claim to", () => {
  it("catches an unscheduled activity", () => {
    const short = {
      ...sample,
      access: sample.access.filter((row) => row.activityId !== "A002"),
    };
    const report = validate(instance, short);
    expect(report.feasible).toBe(false);
    expect(report.hardViolations.some((v) => v.rule === "workload")).toBe(true);
  });

  it("catches an activity starting before its planned week", () => {
    const early = {
      ...sample,
      access: sample.access.map((row) =>
        row.activityId === "A001" ? { ...row, week: 1 } : row,
      ),
      occupancy: sample.occupancy.map((row) =>
        row.activityId === "A001" ? { ...row, week: 1 } : row,
      ),
    };
    const report = validate(instance, early);
    expect(report.hardViolations.some((v) => v.rule === "start_date")).toBe(true);
  });

  it("forbids ECLO in Scenario A but allows it in B", () => {
    const withEclo = {
      ...sample,
      access: sample.access.map((row, i) => (i === 0 ? { ...row, eclo: 1 as const } : row)),
    };
    expect(validate(instance, withEclo).hardViolations.some((v) => v.rule === "eclo")).toBe(true);
    const asB = { ...withEclo, scenario: "B" as const };
    expect(validate(instance, asB).hardViolations.some((v) => v.rule === "eclo")).toBe(false);
  });

  it("hard-fails any overrun in Scenario B", () => {
    const asB = { ...sample, scenario: "B" as const };
    const report = validate(instance, asB);
    // The sample overruns three contracts, which Scenario B does not permit.
    expect(report.hardViolations.some((v) => v.rule === "planned_date")).toBe(true);
  });

  it("rejects a RESULTS.csv mixing scenarios", () => {
    expect(() =>
      parseSubmission({
        access: "activity_id,access_seq,week,eclo,access_night\n",
        occupancy: "activity_id,week,location_id,co_share_group\n",
        results:
          "scenario,contract_number,simulated_completion_date,overrun_days\nA,C001,2027-06-13,0\nB,C002,2027-07-04,0\n",
      }),
    ).toThrow(/exactly one scenario/);
  });
});
