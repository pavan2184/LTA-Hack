// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { validate } from "@railplan/ps1/engine/validate";
import type { Activity, Contract, Scenario } from "@railplan/ps1/types/ps1";
import { decode, nativePayload } from "./cp-sat";
import { selectRepairNeighborhoods } from "./targeted-repair";

const base = loadInstance(Object.fromEntries(PS1_FILES.map((name) => [name,
  readFileSync(resolve("packages/ps1/data/synthetic/01-small-demo", name), "utf8")])));
const north = "SEC:ALP:S02_S03:EB";
const south = "SEC:BET:S12_S13:WB";
type Job = {
  id: string; week: number; predecessor?: string; location?: string; end?: string; contract?: string;
  due?: string; priority?: Activity["activityPriority"]; tier?: Contract["contractPriority"];
  accessType?: Contract["accessType"]; eclo?: boolean;
};
function fixture(jobs: Job[], scenario: Scenario = "A") {
  const instance = structuredClone(base);
  instance.locationSupply.forEach((location) => { location.supplyCapacity = 1; });
  instance.contracts = [...new Map(jobs.map((job) => {
    const contractNumber = job.contract ?? `contract-${job.id}`;
    return [contractNumber, { ...base.contracts[0], contractNumber,
      natureOfActivity: "Non-live (Others)" as const, accessType: job.accessType ?? "PM",
      contractPriority: job.tier ?? 3, plannedCompletionDate: job.due ?? "2027-06-27" }];
  })).values()];
  instance.activities = jobs.map((job) => ({ ...base.activities[0], activityId: job.id,
    contractNumber: job.contract ?? `contract-${job.id}`, activityPriority: job.priority ?? 3,
    startLocationId: job.location ?? north, endLocationId: job.end ?? job.location ?? north,
    totalAccesses: job.eclo ? 3 : 1, plannedStartDate: "2027-01-04",
    predecessorActivityId: job.predecessor ?? null }));
  const access = jobs.flatMap((job) => (job.eclo ? [job.week - 1, job.week] : [job.week])
    .map((week, index) => ({ activityId: job.id, week, accessSeq: index + 1,
      eclo: (job.eclo ? 1 : 0) as 0 | 1, accessNight: 1 })));
  const incumbent = decode(instance, scenario, access);
  expect(validate(instance, incumbent).hardViolations).toEqual([]);
  return { instance, incumbent };
}

describe("targeted native repair neighborhoods", () => {
  it("includes cross-contract ancestors and descendants of a late target, plus an earlier spatial blocker", () => {
    const { instance, incumbent } = fixture([
      { id: "root", week: 1, location: south },
      { id: "late", week: 3, predecessor: "root", due: "2027-01-17", tier: 1 },
      { id: "child", week: 4, predecessor: "late", location: south },
      { id: "blocker", week: 2 },
      { id: "unrelated", week: 6, location: south },
    ]);
    const result = selectRepairNeighborhoods(instance, incumbent, { maxActivities: 4 });
    expect(result[0]).toMatchObject({ kind: "late-chain", targetActivityId: "late", truncated: false,
      movableActivityIds: ["child", "late", "root"] });
    const spatial = result.find((entry) => entry.kind === "spatial-blockers")!;
    expect(spatial.movableActivityIds).toEqual(["blocker", "child", "late", "root"]);
  });

  it("ranks every late activity by v2 penalty, including a nonterminal activity in the same contract", () => {
    const { instance, incumbent } = fixture([
      { id: "earlier", week: 5, due: "2027-01-10", contract: "shared", priority: 1 },
      { id: "terminal", week: 6, due: "2027-01-10", contract: "shared", priority: 3 },
    ]);
    // 28 * 1.3 > 35 * 1.0; terminal-only ranking would miss this target.
    expect(selectRepairNeighborhoods(instance, incumbent)[0].targetActivityId).toBe("earlier");
  });

  it("prioritizes a saturated PM blocker over compatible co-workers", () => {
    const { instance, incumbent } = fixture([
      { id: "target", week: 3, due: "2027-01-17", tier: 1, accessType: "C" },
      { id: "compatible-1", week: 1, accessType: "C" },
      { id: "compatible-2", week: 1, accessType: "C" },
      { id: "blocking-PM", week: 2 },
    ]);
    const result = selectRepairNeighborhoods(instance, incumbent, { maxActivities: 2 });
    expect(result.find((entry) => entry.kind === "spatial-blockers")?.movableActivityIds)
      .toEqual(["blocking-PM", "target"]);
  });

  it("caps a long dependency component without inventing IDs or losing its target", () => {
    const jobs: Job[] = Array.from({ length: 10 }, (_, index) => ({
      id: `job-${index}`, week: index + 1,
      ...(index > 0 ? { predecessor: `job-${index - 1}` } : {}),
      ...(index === 5 ? { tier: 1 as const, due: "2027-01-10" } : {}),
    }));
    const { instance, incumbent } = fixture(jobs);
    const result = selectRepairNeighborhoods(instance, incumbent, { maxActivities: 3, maxNeighborhoods: 4 });
    expect(result.length).toBeLessThanOrEqual(4);
    expect(result[0]).toMatchObject({ targetActivityId: "job-5", truncated: true,
      movableActivityIds: ["job-4", "job-5", "job-6"] });
    const knownIds = new Set(jobs.map((job) => job.id));
    for (const entry of result) {
      expect(entry.movableActivityIds.length).toBeGreaterThan(0);
      expect(entry.movableActivityIds.length).toBeLessThanOrEqual(3);
      expect(entry.movableActivityIds.every((id) => knownIds.has(id))).toBe(true);
      expect(new Set(entry.movableActivityIds).size).toBe(entry.movableActivityIds.length);
    }
    expect(new Set(result.map((entry) => entry.movableActivityIds.join("|"))).size).toBe(result.length);
  });

  it("diversifies by contract and location without requiring every activity in a large cluster", () => {
    const { instance, incumbent } = fixture([
      { id: "top", week: 5, contract: "team", due: "2027-01-10" },
      { id: "same-team", week: 4, contract: "team", due: "2027-01-10", location: south },
      { id: "nearby", week: 3 },
      { id: "other-team", week: 6, location: south },
      { id: "extra", week: 7 },
    ]);
    const result = selectRepairNeighborhoods(instance, incumbent, { maxActivities: 3, maxNeighborhoods: 12 });
    expect(result.find((entry) => entry.kind === "contract")?.movableActivityIds).toEqual(["same-team", "top"]);
    expect(result.some((entry) => entry.kind === "location" && entry.movableActivityIds.includes("nearby"))).toBe(true);
  });

  it("is repeatable, invariant to CSV row order, immutable, and seed-diverse", () => {
    const { instance, incumbent } = fixture(Array.from({ length: 16 }, (_, index) => ({
      id: `job-${index}`, week: index + 1,
    })));
    const before = JSON.stringify({ instance, incumbent });
    const options = { seed: 11, maxActivities: 4, maxNeighborhoods: 12 };
    const first = selectRepairNeighborhoods(instance, incumbent, options);
    expect(selectRepairNeighborhoods(instance, incumbent, options)).toEqual(first);
    const reversed = structuredClone({ instance, incumbent });
    reversed.instance.activities.reverse();
    reversed.instance.contracts.reverse();
    reversed.incumbent.access.reverse();
    reversed.incumbent.occupancy.reverse();
    expect(selectRepairNeighborhoods(reversed.instance, reversed.incumbent, options)).toEqual(first);
    const random = (result: typeof first) => result.find((entry) => entry.kind === "random")?.movableActivityIds;
    expect(random(first)).toHaveLength(4);
    expect(random(selectRepairNeighborhoods(instance, incumbent, { ...options, seed: 99 })))
      .not.toEqual(random(first));
    expect(JSON.stringify({ instance, incumbent })).toBe(before);
  });

  it("targets ECLO and excess-cost participants when feasible scenario B has no lateness", () => {
    const { instance, incumbent } = fixture([
      { id: "eclo", week: 2, eclo: true, location: south },
      ...Array.from({ length: 5 }, (_, index) => ({ id: `excess-${index + 1}`, week: 4,
        accessType: "C" as const, end: "SEC:ALP:H01_H02:EB" })),
      { id: "free", week: 5, location: south },
    ], "B");
    const result = selectRepairNeighborhoods(instance, incumbent, { maxActivities: 2, maxNeighborhoods: 16 });
    // Five C activities need two legal groups at each of nine locations.
    // Each receives 9 * 7 / 5 = 12.6 excess points, above two ECLOs' 10.
    // Unlike the former two-PM fixture, this creates no forbidden host closure.
    expect(result[0].targetActivityId).toBe("excess-1");
    expect(result.some((entry) => entry.movableActivityIds.includes("excess-1") &&
      entry.movableActivityIds.includes("excess-2"))).toBe(true);
    expect(result.some((entry) => entry.targetActivityId === "eclo")).toBe(true);
  });

  it("leaves pins intact in the existing native bridge, even when their activity is movable", () => {
    const { instance, incumbent } = fixture([
      { id: "late", week: 3, due: "2027-01-10" }, { id: "other", week: 2 },
    ]);
    const neighborhood = selectRepairNeighborhoods(instance, incumbent, { maxActivities: 1 })[0];
    const pins = [{ activityId: "late", week: 3, eclo: 0 as const }];
    const payload = nativePayload(instance, "A", 1, { incumbent, pins,
      movableActivityIds: neighborhood.movableActivityIds });
    expect(payload.movableActivityIds).toEqual(["late"]);
    expect(payload.pins).toEqual(pins);
    expect(payload.incumbent).toBe(incumbent);
  });

  it("rejects invalid limits and incumbents, including stale disruption feasibility", () => {
    const { instance, incumbent } = fixture([{ id: "work", week: 1 }]);
    for (const options of [{ seed: -1 }, { seed: 0.5 }, { maxActivities: 0 },
      { maxActivities: NaN }, { maxNeighborhoods: 0 }, { maxNeighborhoods: 65 }]) {
      expect(() => selectRepairNeighborhoods(instance, incumbent, options)).toThrow("Invalid repair");
    }
    expect(() => selectRepairNeighborhoods(instance, { ...incumbent, access: [] }))
      .toThrow("feasible incumbent");
    expect(() => selectRepairNeighborhoods(instance, incumbent, {
      disruptions: [{ locationId: north, fromWeek: 1, toWeek: 1, capacity: 0 }],
    })).toThrow("feasible incumbent");
  });
});
