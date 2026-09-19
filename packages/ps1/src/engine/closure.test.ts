// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadInstance, PS1_FILES } from "../io/load";
import { parseSubmission } from "../io/submission";
import type { OccupancyRow } from "../types/ps1";
import { closureConflicts, findClosureViolations } from "./closure";
import regression from "./fixtures/public-a-closure-regression.json";

const instance = loadInstance(Object.fromEntries(PS1_FILES.map((name) =>
  [name, readFileSync(resolve("packages/ps1/data/public", name), "utf8")])));
const row = (activityId: string, locationId: string, coShareGroup: string, week = 1): OccupancyRow =>
  ({ activityId, locationId, coShareGroup, week });
const conflict = [{ sourceId: "host", targetId: "external", locations: ["buffer"] }];

describe("possession closure components", () => {
  it("reproduces every reported organiser violation before the fix", () => {
    const found = findClosureViolations(regression.partialSubmission.occupancy, closureConflicts(instance));
    const expected = regression.expectedViolations.map((item) =>
      `wk${item.week}: ${item.targetActivityId} inside closure of ['${item.sourceActivityId}'] at [${item.locations.slice(0, 4).map((id) => `'${id}'`).join(", ")}]`);
    expect(found.map((item) => item.detail).sort()).toEqual(expected.sort());
    expect(found).toHaveLength(15);
  });
  it("does not exempt unrelated locations with the same b1 label", () => {
    expect(findClosureViolations([
      row("host", "left", "b1"), row("external", "right", "b1"),
    ], conflict)).toHaveLength(1);
  });

  it("exempts actual co-sharing and transitive C bridges", () => {
    expect(findClosureViolations([
      row("host", "left", "b1"), row("bridge", "left", "b1"),
      row("bridge", "right", "b2"), row("external", "right", "b2"),
    ], conflict)).toEqual([]);
  });

  it("does not join different groups or different weeks", () => {
    expect(findClosureViolations([
      row("host", "left", "b1"), row("external", "left", "b2"),
      row("host", "left", "b1", 2), row("external", "left", "b1", 2),
    ], conflict)).toHaveLength(1);
    expect(findClosureViolations([
      row("host", "left", "b1"), row("external", "left", "b1", 2),
    ], conflict)).toEqual([]);
  });

  it("uses nature and access compatibility, including Live cross-line buffers", () => {
    const conflicts = closureConflicts(instance);
    expect(conflicts.find((item) => item.sourceId === "A074" && item.targetId === "A065")?.locations)
      .toContain("PLAT:BET:S13:WB");
  });

  it("protects Live C work and checks a Consist C buffer against PM work", () => {
    const source = { ...instance.activities[0], activityId: "source", contractNumber: "source-contract",
      startLocationId: "SEC:ALP:S02_S03:EB", endLocationId: "SEC:ALP:S02_S03:EB" };
    const target = { ...instance.activities[0], activityId: "target", contractNumber: "target-contract",
      startLocationId: "SEC:ALP:S03_S04:EB", endLocationId: "SEC:ALP:S03_S04:EB" };
    const make = (live: boolean) => ({ ...instance, activities: [source, target], contracts: [
      { ...instance.contracts[0], contractNumber: "source-contract", accessType: "C" as const,
        natureOfActivity: live ? "Live" as const : "Non-live (Consist)" as const },
      { ...instance.contracts[0], contractNumber: "target-contract", accessType: live ? "C" as const : "PM" as const,
        natureOfActivity: "Non-live (Others)" as const },
    ] });
    for (const live of [false, true]) {
      expect(closureConflicts(make(live)).find((item) => item.sourceId === "source" && item.targetId === "target")?.locations)
        .toContain("SEC:ALP:S03_S04:EB");
    }
  });

  it("retains the published non-Live PC/C buffer exemption", () => {
    const host = instance.activities.find((item) => item.activityId === "A025")!;
    const coworker = { ...instance.activities.find((item) => item.activityId === "A001")!,
      activityId: "coworker", startLocationId: "SEC:ALP:S03_S04:EB", endLocationId: "SEC:ALP:S03_S04:EB" };
    expect(closureConflicts({ ...instance, activities: [host, coworker] })).toEqual([]);
  });

  it("rejects buffer-only overlaps between separate buffered hosts", () => {
    const first = { ...instance.activities.find((item) => item.activityId === "A025")!,
      activityId: "first", startLocationId: "SEC:ALP:S01_S02:EB", endLocationId: "SEC:ALP:S01_S02:EB" };
    const second = { ...instance.activities.find((item) => item.activityId === "A028")!,
      activityId: "second", startLocationId: "SEC:ALP:S03_S04:EB", endLocationId: "SEC:ALP:S03_S04:EB" };
    const conflicts = closureConflicts({ ...instance, activities: [first, second] });
    expect(conflicts).toHaveLength(2);
    expect(conflicts.every((item) => item.kind === "buffer")).toBe(true);
    expect(findClosureViolations([
      row("first", "SEC:ALP:S01_S02:EB", "b1"), row("second", "SEC:ALP:S03_S04:EB", "b1"),
    ], conflicts)).toHaveLength(2);
  });

  it("accepts the published sample's indirect A074/A004/A025 sharing", () => {
    const dir = resolve("packages/ps1/data/sample-submission");
    const sample = parseSubmission({
      access: readFileSync(resolve(dir, "SCHEDULE_ACCESS.csv"), "utf8"),
      occupancy: readFileSync(resolve(dir, "SCHEDULE_OCCUPANCY.csv"), "utf8"),
      results: readFileSync(resolve(dir, "RESULTS.csv"), "utf8"),
    });
    const conflicts = closureConflicts(instance);
    expect(findClosureViolations(sample.occupancy, conflicts)).toEqual([]);
    const unbridged = sample.occupancy.filter((item) => item.activityId !== "A004");
    expect(findClosureViolations(unbridged, conflicts).some((item) =>
      item.detail.includes("wk21: A025 inside closure of ['A074']"))).toBe(true);
  });
});
