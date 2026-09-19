// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "../io/load";
import { parseSubmission } from "../io/submission";
import type { Ps1Instance, Scenario, Submission } from "../types/ps1";
import { buildNetwork, expandSpan } from "./network";
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
    expect(report.formulaVersion).toBe("ps1-objective-v2");
  });
});

describe("per-activity lateness penalties", () => {
  function scoredWeeks(weeks: [number, number], scenario: Scenario, plannedDate = "2027-01-10") {
    const contract = {
      ...instance.contracts[0],
      contractNumber: "score-contract",
      contractPriority: 3 as const,
      plannedCompletionDate: plannedDate,
      natureOfActivity: "Non-live (Others)" as const,
      accessType: "C" as const,
      numberOfWorkfronts: 1,
      numberOfMaximumAccessPerWeek: 3,
    };
    const input: Ps1Instance = {
      ...instance,
      contracts: [contract],
      activities: ([1, 3] as const).map((priority, index) => ({
        ...instance.activities[0],
        activityId: `score-${index}`,
        contractNumber: contract.contractNumber,
        totalAccesses: 1,
        plannedStartDate: "2027-01-04",
        predecessorActivityId: null,
        activityPriority: priority,
      })),
    };
    const network = buildNetwork(input);
    // Fixed calendar dates make this oracle independent of the scoring helper.
    const completion = ["2027-01-10", "2027-01-17", "2027-01-24"][Math.max(...weeks) - 1];
    const submission: Submission = {
      scenario,
      access: input.activities.map((activity, index) => ({
        activityId: activity.activityId, accessSeq: 1, week: weeks[index],
        eclo: 0, accessNight: index + 1,
      })),
      occupancy: input.activities.flatMap((activity, index) =>
        expandSpan(network, activity.startLocationId, activity.endLocationId).map((locationId) => ({
          activityId: activity.activityId, week: weeks[index], locationId, coShareGroup: "shared",
        }))),
      results: [{
        scenario, contractNumber: contract.contractNumber, simulatedCompletionDate: completion,
        overrunDays: Math.max(0, (Date.parse(completion) - Date.parse(plannedDate)) / 86_400_000),
      }],
    };
    const report = validate(input, submission);
    expect(report.hardViolations).toEqual([]);
    return report;
  }

  it.each(["A", "C"] as const)("charges both late activities in %s, even when they finish in different weeks", (scenario) => {
    const report = scoredWeeks([2, 3], scenario);
    // H is 7 days late at 1.3/day; L is 14 days late at 1/day.
    expect(report.softScores.priorityWeightedScore).toBe(23.1);
    expect(report.objectiveScore).toBe(23.1);
    // Contract-level completion reporting stays one 14-day overrun.
    expect(report.softScores.overrunDaysTotal).toBe(14);
    expect(report.softScores.contractsOverrunning).toBe(1);
    expect(report.softScores.priorityOverrun).toEqual({ "1": 0, "2": 0, "3": 14 });
  });

  it("cannot lower the penalty by delaying another activity in the same contract", () => {
    expect(scoredWeeks([2, 2], "A").objectiveScore).toBe(16.1);
    expect(scoredWeeks([2, 3], "A").objectiveScore).toBe(23.1);
  });

  it("does not charge an on-time activity for another activity's delay", () => {
    expect(scoredWeeks([1, 3], "A").objectiveScore).toBe(14);
  });

  it("uses each activity's exact day difference for a midweek planned date", () => {
    // Jan 17 - Jan 13 = 4 days; Jan 24 - Jan 13 = 11 days.
    expect(scoredWeeks([2, 3], "A", "2027-01-13").objectiveScore).toBe(16.2);
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
    const asB = {
      ...sample,
      scenario: "B" as const,
      results: sample.results.map((row) => ({ ...row, scenario: "B" as const })),
    };
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

  it("rejects forged RESULTS values and duplicate contract rows", () => {
    const forged = {
      ...sample,
      results: sample.results.map((row, index) =>
        index === 0
          ? { ...row, simulatedCompletionDate: "2099-01-01", overrunDays: 0 }
          : row,
      ),
    };
    expect(validate(instance, forged).hardViolations.some((v) => v.rule === "schema")).toBe(true);
    const duplicate = { ...sample, results: [...sample.results, sample.results[0]] };
    expect(validate(instance, duplicate).hardViolations.some((v) => /duplicate contract/.test(v.detail))).toBe(true);
  });

  it("rejects out-of-range nights, duplicate weeks and non-contiguous sequences", () => {
    const badNight = {
      ...sample,
      access: sample.access.map((row, index) => (index === 0 ? { ...row, accessNight: 999 } : row)),
    };
    expect(validate(instance, badNight).hardViolations.some((v) => v.rule === "weekly_allocation")).toBe(true);

    const first = sample.access[0];
    const duplicate = {
      ...sample,
      access: [...sample.access, { ...first, accessSeq: 99 }],
    };
    const duplicateReport = validate(instance, duplicate);
    expect(duplicateReport.feasible).toBe(false);
    expect(duplicateReport.hardViolations.some((v) => /more than one access/.test(v.detail))).toBe(true);

    const gap = {
      ...sample,
      access: sample.access.map((row, index) => (index === 0 ? { ...row, accessSeq: 88 } : row)),
    };
    expect(validate(instance, gap).hardViolations.some((v) => /contiguous/.test(v.detail))).toBe(true);
  });

  it("requires occupancy to match every access exactly", () => {
    const target = sample.occupancy[0];
    const missing = { ...sample, occupancy: sample.occupancy.slice(1) };
    expect(validate(instance, missing).hardViolations.some((v) => /does not occupy/.test(v.detail))).toBe(true);

    const duplicate = { ...sample, occupancy: [...sample.occupancy, target] };
    expect(validate(instance, duplicate).hardViolations.some((v) => /duplicate occupancy/.test(v.detail))).toBe(true);

    const activityWeeks = new Set(
      sample.access.filter((row) => row.activityId === target.activityId).map((row) => row.week),
    );
    const orphanWeek = Array.from(
      { length: instance.parameters.horizonWeeks },
      (_, index) => index + 1,
    ).find((week) => !activityWeeks.has(week))!;
    const orphan = { ...sample, occupancy: [...sample.occupancy, { ...target, week: orphanWeek }] };
    expect(validate(instance, orphan).hardViolations.some((v) => /orphan occupancy/.test(v.detail))).toBe(true);

    const otherLocation = instance.locationSupply.find(
      (row) => !sample.occupancy.some((item) => item.activityId === target.activityId && item.week === target.week && item.locationId === row.locationId),
    )!;
    const extra = {
      ...sample,
      occupancy: [...sample.occupancy, { ...target, locationId: otherLocation.locationId }],
    };
    expect(validate(instance, extra).hardViolations.some((v) => /extra occupancy/.test(v.detail))).toBe(true);
  });

  it("applies Scenario C's ECLO window to both lines touched by Live work", () => {
    const asC = {
      ...sample,
      scenario: "C" as const,
      results: sample.results.map((row) => ({ ...row, scenario: "C" as const })),
      access: sample.access.map((row) =>
        row.activityId === "A074" || row.activityId === "A075"
          ? { ...row, eclo: 1 as const }
          : row,
      ),
    };
    const report = validate(instance, asC);
    expect(report.hardViolations.some((v) => v.rule === "eclo_window" && /ALP|BET/.test(v.detail))).toBe(true);
  });
});
