// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "../io/load";
import { scheduleInstance } from "./schedule";
import { validate } from "./validate";
import { explainPlacement } from "./explain";
import { computeMetrics, overrunBreakdown } from "./metrics";
import { summariseByCategory, categoryOf, conflictCategories } from "./categories";

const instance = loadInstance(
  Object.fromEntries(
    PS1_FILES.map((n) => [n, readFileSync(resolve("packages/ps1/data/public", n), "utf8")]),
  ),
);
const submission = scheduleInstance(instance, { scenario: "A" });
const report = validate(instance, submission);

describe("placement explanation", () => {
  it("explains every scheduled activity without throwing", () => {
    for (const activity of instance.activities) {
      const explanation = explainPlacement(instance, submission, activity.activityId);
      expect(explanation, activity.activityId).not.toBeNull();
      expect(explanation!.summary.length).toBeGreaterThan(0);
    }
  });

  it("returns null for an activity the instance does not have", () => {
    expect(explainPlacement(instance, submission, "NOPE")).toBeNull();
  });

  it("says so plainly when an activity landed on its planned week", () => {
    const onTime = instance.activities.find((activity) => {
      const explanation = explainPlacement(instance, submission, activity.activityId)!;
      return explanation.weeksSlipped === 0 && explanation.actualWeek !== null;
    });
    expect(onTime).toBeDefined();
    const explanation = explainPlacement(instance, submission, onTime!.activityId)!;
    expect(explanation.summary).toMatch(/the week it was planned for/);
    expect(explanation.blockers).toEqual([]);
  });

  /**
   * The point of the counterfactual: a slipped activity must name what actually
   * stopped it, week by week, rather than assert that it was busy.
   */
  it("accounts for every week between planned and actual", () => {
    const slipped = instance.activities
      .map((activity) => explainPlacement(instance, submission, activity.activityId)!)
      .filter((explanation) => explanation.weeksSlipped > 0);
    expect(slipped.length).toBeGreaterThan(0);
    for (const explanation of slipped) {
      expect(explanation.blockers).toHaveLength(explanation.weeksSlipped);
      for (const blocker of explanation.blockers) {
        expect(blocker.week).toBeGreaterThanOrEqual(explanation.plannedWeek);
        expect(blocker.week).toBeLessThan(explanation.actualWeek!);
      }
    }
  });

  it("never blames an activity for blocking itself", () => {
    for (const activity of instance.activities) {
      const explanation = explainPlacement(instance, submission, activity.activityId)!;
      for (const blocker of explanation.blockers) {
        expect(blocker.detail).not.toContain(activity.activityId);
      }
    }
  });

  it("is honest when nothing blocked the earlier weeks", () => {
    // A greedy scheduler places dearer work first, so some activities slip with
    // no rule against them. Inventing a blocker there would be a lie — the
    // summary must either name a predecessor or say that dearer work took the
    // week, never assert a constraint that did not fire.
    const explanations = instance.activities.map(
      (a) => explainPlacement(instance, submission, a.activityId)!,
    );
    const unblocked = explanations.filter(
      (e) => e.weeksSlipped > 0 && e.blockers.every((b) => b.kind === "none"),
    );
    expect(unblocked.length).toBeGreaterThan(0);
    for (const explanation of unblocked) {
      expect(explanation.summary).toMatch(/higher-priority work|had to finish first/);
    }
  });

  it("prefers a predecessor as the reason over anything else", () => {
    // A004 depends on A003. Dependency is the honest headline even when the
    // network was also busy, because relieving congestion would not have helped.
    const explanation = explainPlacement(instance, submission, "A004")!;
    expect(explanation.summary).toMatch(/A003 had to finish first/);
  });

  it("carries the facts a panel needs to render rows", () => {
    const explanation = explainPlacement(instance, submission, "A001")!;
    const labels = explanation.facts.map((fact) => fact.label);
    expect(labels).toEqual(expect.arrayContaining(["Contract", "Span", "Workload", "Planned start", "Scheduled"]));
  });
});

describe("metrics show their working", () => {
  const metrics = computeMetrics(instance, submission, report);

  it("gives every metric a formula containing its own numbers", () => {
    for (const metric of metrics) {
      expect(metric.formula, metric.key).toMatch(/\d/);
      expect(metric.note.length, metric.key).toBeGreaterThan(20);
    }
  });

  it("reports full delivery on a complete schedule", () => {
    const delivery = metrics.find((m) => m.key === "delivery")!;
    expect(delivery.value).toBeGreaterThanOrEqual(100);
    const scheduled = metrics.find((m) => m.key === "activities-scheduled")!;
    expect(scheduled.numerator).toBe(instance.activities.length);
  });

  it("shows co-sharing buying more than one activity per possession", () => {
    const coShare = metrics.find((m) => m.key === "co-sharing")!;
    expect(coShare.value).toBeGreaterThan(1);
  });

  it("breaks the weighted overrun into rows that sum to the reported score", () => {
    const rows = overrunBreakdown(instance, submission);
    const total = rows.reduce((sum, row) => sum + row.points, 0);
    expect(Math.round(total * 10) / 10).toBeCloseTo(report.softScores.priorityWeightedScore, 1);
  });

  it("keeps a lower-tier contract inside its band", () => {
    for (const row of overrunBreakdown(instance, submission)) {
      const ceiling = row.contractWeight * 1.3;
      expect(row.points).toBeLessThanOrEqual(ceiling * row.overrunDays + 1e-9);
    }
  });
});

describe("violation categories", () => {
  it("classifies every rule the validator can emit", () => {
    const covered = new Set(conflictCategories.flatMap((profile) => profile.rules));
    for (const rule of [
      "workload", "start_date", "closure", "capacity", "mix",
      "weekly_allocation", "workfront", "eclo", "eclo_window", "planned_date", "schema",
    ] as const) {
      expect(covered.has(rule), rule).toBe(true);
      expect(categoryOf(rule).lever.length).toBeGreaterThan(10);
    }
  });

  it("groups a failing submission by category, worst pile first", () => {
    const asB = { ...submission, scenario: "B" as const };
    const failing = validate(instance, asB);
    const summary = summariseByCategory(failing.hardViolations);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary[0].count).toBeGreaterThanOrEqual(summary[summary.length - 1].count);
    expect(summary.reduce((sum, s) => sum + s.count, 0)).toBe(failing.hardViolations.length);
  });
});
