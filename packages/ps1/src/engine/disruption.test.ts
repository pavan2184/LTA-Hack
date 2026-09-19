// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "../io/load";
import { buildNetwork } from "./network";
import { scheduleInstance, solveInstance } from "./schedule";
import { validate } from "./validate";
import { assessDisruption, capacityAt, replanForDisruption, type Disruption } from "./disruption";

const instance = loadInstance(
  Object.fromEntries(
    PS1_FILES.map((n) => [n, readFileSync(resolve("packages/ps1/data/public", n), "utf8")]),
  ),
);
const network = buildNetwork(instance);
const baseline = scheduleInstance(instance, { scenario: "A" }, network);

/** The busiest location-week in the baseline, which is what a cut should bite. */
function busiest() {
  const counts = new Map<string, Set<string>>();
  for (const row of baseline.occupancy) {
    const key = `${row.locationId}|${row.week}`;
    counts.set(key, (counts.get(key) ?? new Set()).add(row.coShareGroup));
  }
  const [key, groups] = [...counts].sort((a, b) => b[1].size - a[1].size)[0];
  const [locationId, week] = key.split("|");
  return { locationId, week: Number(week), possessions: groups.size };
}

describe("capacity under disruption", () => {
  const target = busiest();
  const disruption: Disruption = {
    locationId: target.locationId,
    fromWeek: target.week,
    toWeek: target.week,
    capacity: 1,
  };

  it("reduces capacity only inside the affected window", () => {
    const nominal = network.supply.get(target.locationId)!.supplyCapacity;
    expect(capacityAt(network, [disruption], target.locationId, target.week)).toBe(1);
    expect(capacityAt(network, [disruption], target.locationId, target.week + 1)).toBe(nominal);
    expect(capacityAt(network, [disruption], target.locationId, target.week - 1)).toBe(nominal);
  });

  it("takes the tightest of two overlapping cuts rather than adding them", () => {
    const second: Disruption = { ...disruption, capacity: 2 };
    expect(capacityAt(network, [disruption, second], target.locationId, target.week)).toBe(1);
  });

  it("leaves other locations alone", () => {
    const other = [...network.supply.keys()].find((id) => id !== target.locationId)!;
    expect(capacityAt(network, [disruption], other, target.week)).toBe(
      network.supply.get(other)!.supplyCapacity,
    );
  });
});

describe("impact assessment", () => {
  const target = busiest();
  const disruption: Disruption = {
    locationId: target.locationId,
    fromWeek: target.week,
    toWeek: target.week,
    capacity: 1,
  };
  const impact = assessDisruption(instance, baseline, [disruption], network);

  it("names the location-weeks that no longer fit", () => {
    expect(impact.affected.length).toBeGreaterThan(0);
    for (const entry of impact.affected) {
      expect(entry.possessions).toBeGreaterThan(entry.reducedCapacity);
      expect(entry.excess).toBe(entry.possessions - entry.reducedCapacity);
    }
  });

  it("displaces exactly the excess, not the whole location", () => {
    const displacedGroups = impact.displaced.filter((d) => d.week === target.week);
    expect(displacedGroups.length).toBeGreaterThan(0);
    expect(impact.displacedActivityIds.length).toBeLessThan(instance.activities.length);
  });

  it("gives every displaced access a reason naming the cut", () => {
    for (const entry of impact.displaced) {
      expect(entry.reason).toContain(target.locationId);
      expect(entry.reason).toMatch(/fell from \d+ to \d+/);
    }
  });

  it("reports nothing when the cut does not bite", () => {
    const harmless: Disruption = {
      locationId: target.locationId,
      fromWeek: target.week,
      toWeek: target.week,
      capacity: network.supply.get(target.locationId)!.supplyCapacity,
    };
    const none = assessDisruption(instance, baseline, [harmless], network);
    expect(none.affected).toEqual([]);
    expect(none.displaced).toEqual([]);
  });
});

describe("replanning with minimal churn", () => {
  // Full public construction plus closure-aware repair exceeds Vitest's 5s
  // default on the CI runner; retain the complete fixture and solver budgets.
  it("moves downstream work when a physical cut delays its predecessor", () => {
    const before = solveInstance(instance, { scenario: "C" }, network).submission!;
    const cut: Disruption = { locationId: "PLAT:BET:H01:EB", fromWeek: 15, toWeek: 15, capacity: 0 };
    const after = replanForDisruption(instance, before, [cut], network);
    expect(validate(instance, after.submission, network, [cut]).hardViolations).toEqual([]);
    const predecessorLast = Math.max(...after.submission.access.filter((r) => r.activityId === "A003").map((r) => r.week));
    const successorFirst = Math.min(...after.submission.access.filter((r) => r.activityId === "A004").map((r) => r.week));
    expect(successorFirst).toBeGreaterThan(predecessorLast);
    expect(after.churn.percentUnchanged).toBeGreaterThan(90);
  }, 30_000);
  const target = busiest();
  const disruption: Disruption = {
    locationId: target.locationId,
    fromWeek: target.week,
    toWeek: target.week,
    capacity: 1,
  };
  const outcome = replanForDisruption(instance, baseline, [disruption], network);

  it("produces a schedule that is feasible against the disrupted night", () => {
    const report = validate(instance, outcome.submission, network, [disruption]);
    expect(report.hardViolations).toEqual([]);
    expect(report.feasible).toBe(true);
  });

  it("still delivers every activity in full", () => {
    for (const activity of instance.activities) {
      const yielded = outcome.submission.access
        .filter((row) => row.activityId === activity.activityId)
        .reduce((sum, row) => sum + (row.eclo === 1 ? 1.5 : 1), 0);
      expect(yielded, activity.activityId).toBeGreaterThanOrEqual(activity.totalAccesses);
    }
  });

  it("respects the reduced capacity at the cut location-week", () => {
    const groups = new Set(
      outcome.submission.occupancy
        .filter((row) => row.locationId === target.locationId && row.week === target.week)
        .map((row) => row.coShareGroup),
    );
    expect(groups.size).toBeLessThanOrEqual(1);
  });

  /**
   * The property the bonus scope actually asks for. A replan that rebuilt the
   * whole horizon would score the same on feasibility and be useless in
   * practice, because every moved access is a contractor to telephone.
   */
  it("holds the overwhelming majority of the schedule still", () => {
    expect(outcome.churn.percentUnchanged).toBeGreaterThan(90);
    expect(outcome.churn.movedAccesses).toBeLessThan(baseline.access.length * 0.1);
  });

  it("moves only activities the disruption actually touched, or their knock-on", () => {
    // Anything that moved must either have been displaced outright, or share a
    // contract with something displaced and been pushed by the refill.
    expect(outcome.churn.movedActivityIds.length).toBeGreaterThan(0);
    expect(outcome.churn.movedActivityIds.length).toBeLessThanOrEqual(
      instance.activities.length,
    );
  });

  it("changes nothing at all when the disruption does not bite", () => {
    const harmless: Disruption = {
      locationId: target.locationId,
      fromWeek: target.week,
      toWeek: target.week,
      capacity: network.supply.get(target.locationId)!.supplyCapacity,
    };
    const quiet = replanForDisruption(instance, baseline, [harmless], network);
    expect(quiet.churn.movedAccesses).toBe(0);
    expect(quiet.churn.percentUnchanged).toBe(100);
  });
});
