// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "../io/load";
import { scheduleInstance } from "./schedule";
import { validate } from "./validate";

const instance = loadInstance(
  Object.fromEntries(
    PS1_FILES.map((n) => [n, readFileSync(resolve("packages/ps1/data/public", n), "utf8")]),
  ),
);
const baseline = scheduleInstance(instance, { scenario: "A" });

const firstWeekOf = (submission: { access: { activityId: string; week: number }[] }, id: string) =>
  Math.min(...submission.access.filter((row) => row.activityId === id).map((row) => row.week));

describe("pins are hard constraints entered before the solve", () => {
  it("honours a pin and still returns a feasible schedule", () => {
    const target = "A001";
    const original = firstWeekOf(baseline, target);
    const pinnedWeek = original + 3;

    const pinned = scheduleInstance(instance, {
      scenario: "A",
      pins: [{ activityId: target, week: pinnedWeek }],
    });

    expect(pinned.rejectedPins).toEqual([]);
    expect(pinned.access.some((r) => r.activityId === target && r.week === pinnedWeek)).toBe(true);
    expect(validate(instance, pinned).hardViolations).toEqual([]);
  });

  it("still delivers every activity's full workload around a pin", () => {
    const pinned = scheduleInstance(instance, {
      scenario: "A",
      pins: [{ activityId: "A003", week: 20 }],
    });
    for (const activity of instance.activities) {
      const yielded = pinned.access
        .filter((row) => row.activityId === activity.activityId)
        .reduce((sum, row) => sum + (row.eclo === 1 ? 1.5 : 1), 0);
      expect(yielded, activity.activityId).toBeGreaterThanOrEqual(activity.totalAccesses);
    }
  });

  it("gives a pinned activity no more accesses than its workload", () => {
    const target = "A003";
    const activity = instance.activities.find((a) => a.activityId === target)!;
    const pinned = scheduleInstance(instance, {
      scenario: "A",
      pins: [{ activityId: target, week: 20 }],
    });
    const rows = pinned.access.filter((row) => row.activityId === target);
    expect(rows).toHaveLength(activity.totalAccesses);
    // The pinned week is used once, not twice.
    expect(rows.filter((row) => row.week === 20)).toHaveLength(1);
  });

  /**
   * A pin is a hard constraint, not a licence. It cannot buy an earlier start
   * than the activity's own planned date, which is rule 2 and not negotiable.
   */
  it("refuses a pin before the planned start week, with a reason", () => {
    const result = scheduleInstance(instance, {
      scenario: "A",
      pins: [{ activityId: "A001", week: 1 }],
    });
    expect(result.rejectedPins).toHaveLength(1);
    expect(result.rejectedPins[0].reason).toMatch(/before the planned start/);
    expect(validate(instance, result).hardViolations).toEqual([]);
  });

  it("refuses a pin for an activity the instance does not have", () => {
    const result = scheduleInstance(instance, {
      scenario: "A",
      pins: [{ activityId: "NOPE", week: 5 }],
    });
    expect(result.rejectedPins[0].reason).toMatch(/no activity NOPE/);
  });

  it("moves other work around the pin rather than layering over it", () => {
    // The point of entering pins before the solve: the rest of the schedule
    // reacts. If nothing moved, the pin was an overlay and the reported plan
    // would not be one anybody could run.
    const target = "A003";
    const pinnedWeek = firstWeekOf(baseline, target) + 6;
    const pinned = scheduleInstance(instance, {
      scenario: "A",
      pins: [{ activityId: target, week: pinnedWeek }],
    });
    const before = new Map(baseline.access.map((r) => [`${r.activityId}|${r.accessSeq}`, r.week]));
    const moved = pinned.access.filter(
      (r) => r.activityId !== target && before.get(`${r.activityId}|${r.accessSeq}`) !== r.week,
    );
    expect(moved.length).toBeGreaterThan(0);
  });

  it("leaves the schedule unchanged when no pins are given", () => {
    const again = scheduleInstance(instance, { scenario: "A" });
    expect(again.access).toEqual(baseline.access);
    expect(again.rejectedPins).toEqual([]);
  });
});
