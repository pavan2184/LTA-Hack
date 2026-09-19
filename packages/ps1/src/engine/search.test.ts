// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadInstance, PS1_FILES } from "../io/load";
import { writeSubmission } from "../io/write";
import { buildNetwork, closureFor, expandSpan } from "./network";
import { solveInstance } from "./schedule";
import { windowCandidates } from "./search";
import { validate } from "./validate";

function fixture(id: string) {
  return loadInstance(Object.fromEntries(PS1_FILES.map((name) => [name,
    readFileSync(resolve(`packages/ps1/data/${id}`, name), "utf8")])));
}

describe("validated portfolio and adaptive repairs", () => {
  it("ignores a candidate from another upload instead of crashing result projection", () => {
    const source = fixture("synthetic/01-small-demo");
    const target = fixture("synthetic/02-co-sharing");
    const stale = solveInstance(source, { scenario: "A" }).submission!;
    const result = solveInstance(target, { scenario: "C", initialCandidates: [stale] });
    expect(result.status).toBe("FEASIBLE");
    expect(result.validation!.objectiveScore).toBe(0);
  });
  it("reuses a zero-score nominal solution in both flexible scenarios", () => {
    const instance = fixture("synthetic/02-co-sharing");
    const a = solveInstance(instance, { scenario: "A" }).submission!;
    for (const scenario of ["B", "C"] as const) {
      const legacy = solveInstance(instance, { scenario, searchMode: "legacy" });
      const result = solveInstance(instance, { scenario, initialCandidates: [a] });
      expect(legacy.validation!.objectiveScore).toBeGreaterThan(0);
      expect(result.validation!.objectiveScore).toBe(0);
      expect(result.submission!.scenario).toBe(scenario);
      expect(result.submission!.results.every((r) => r.scenario === scenario)).toBe(true);
    }
  });

  it("optimises C's two-week windows without importing B's illegal separated windows", () => {
    const instance = fixture("synthetic/09-separated-eclo-windows");
    const b = solveInstance(instance, { scenario: "B" }).submission!;
    const result = solveInstance(instance, { scenario: "C", initialCandidates: [b] });
    expect(result.status).toBe("FEASIBLE");
    expect(result.validation!.objectiveScore).toBe(1840);
    expect(result.validation!.softScores.ecloNightsTotal).toBe(4);
    expect(result.validation!.hardViolations).toEqual([]);
  });

  it("checks a warm start against target disruptions and exact user pins", () => {
    const instance = fixture("synthetic/02-co-sharing");
    const before = solveInstance(instance, { scenario: "A" }).submission!;
    const row = before.access[0];
    const pin = { activityId: row.activityId, week: row.week + 1, eclo: 0 as const };
    const pinned = solveInstance(instance, { scenario: "C", pins: [pin], initialCandidates: [before] });
    expect(pinned.status).toBe("FEASIBLE");
    expect(pinned.submission!.access.some((r) => r.activityId === pin.activityId && r.week === pin.week && r.eclo === 0)).toBe(true);
    const locationId = before.occupancy[0].locationId;
    const disruptions = [{ locationId, fromWeek: 1, toWeek: 1, capacity: 0 }];
    const disrupted = solveInstance(instance, { scenario: "C", initialCandidates: [before], disruptions });
    expect(disrupted.status).toBe("FEASIBLE");
    expect(validate(instance, disrupted.submission!, undefined, disruptions).feasible).toBe(true);
    expect(disrupted.submission!.occupancy.some((r) => r.locationId === locationId && r.week === 1)).toBe(false);
  });

  it("rejects impossible pins instead of treating a warm start as permission to drop them", () => {
    const instance = fixture("synthetic/01-small-demo");
    const before = solveInstance(instance, { scenario: "A" }).submission!;
    const result = solveInstance(instance, { scenario: "A", initialCandidates: [before],
      pins: [{ activityId: instance.activities[0].activityId, week: 31 }] });
    expect(result.status).not.toBe("FEASIBLE");
    expect(result.diagnostics.warnings.join(" ")).toContain("not a proof of infeasibility");
  });

  it("repeats seeded repair byte-for-byte and improves the public B baseline", () => {
    const instance = fixture("public");
    const options = { scenario: "B" as const, optimizationBudget: { seed: 1 } };
    const a = solveInstance(instance, options);
    const b = solveInstance(instance, options);
    expect(a.validation!.objectiveScore).toBeLessThan(44);
    expect(writeSubmission(a.submission!)).toEqual(writeSubmission(b.submission!));
  });

  it("requires a Live ECLO pin to fit windows on every affected line", () => {
    const instance = fixture("synthetic/03-live-interchange");
    const network = buildNetwork(instance);
    const activity = instance.activities.find((a) => a.activityId === "03-A001")!;
    const contract = instance.contracts.find((c) => c.contractNumber === activity.contractNumber)!;
    const lines = new Set(closureFor(network, expandSpan(network, activity.startLocationId, activity.endLocationId), contract.natureOfActivity)
      .map((id) => network.supply.get(id)!.lineCode));
    expect(lines.size).toBe(2);
    const choices = windowCandidates(instance, network, [{ activityId: activity.activityId, week: 6, eclo: 1 }]);
    expect(choices.length).toBeGreaterThan(0);
    for (const windows of choices) for (const line of lines) {
      expect(windows[line]).toBeLessThanOrEqual(6);
      expect(windows[line] + 1).toBeGreaterThanOrEqual(6);
    }
  });
});
