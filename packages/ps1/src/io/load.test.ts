// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "./load";

const dir = resolve("packages/ps1/data/public");
const files = Object.fromEntries(
  PS1_FILES.map((name) => [name, readFileSync(resolve(dir, name), "utf8")]),
);

/**
 * Loading is checked against the published instance rather than a fabricated
 * one. The judges upload a hidden instance in the same eight-file shape, so the
 * loader's contract is exactly "whatever that shape is", and a fixture of my own
 * invention would only prove it parses itself.
 */
describe("PS1 instance loading", () => {
  const instance = loadInstance(files);

  it("reads the published instance at its documented size", () => {
    expect(instance.lines).toHaveLength(2);
    expect(instance.stations).toHaveLength(20);
    expect(instance.sectors).toHaveLength(18);
    expect(instance.locationSupply).toHaveLength(76);
    expect(instance.contracts).toHaveLength(14);
    expect(instance.activities).toHaveLength(54);
    expect(instance.parameters).toEqual({
      horizonStart: "2027-01-04",
      horizonWeeks: 30,
    });
  });

  it("types numbers as numbers rather than strings", () => {
    const c001 = instance.contracts.find((c) => c.contractNumber === "C001")!;
    expect(c001.contractPriority).toBe(3);
    expect(c001.numberOfWorkfronts).toBe(2);
    expect(c001.numberOfMaximumAccessPerWeek).toBe(3);
    expect(c001.accessType).toBe("C");
    expect(c001.natureOfActivity).toBe("Non-live (Consist)");

    const a001 = instance.activities.find((a) => a.activityId === "A001")!;
    expect(a001.totalAccesses).toBe(2);
    expect(a001.activityPriority).toBe(2);
  });

  it("represents an absent predecessor as null, not an empty string", () => {
    const a001 = instance.activities.find((a) => a.activityId === "A001")!;
    const a004 = instance.activities.find((a) => a.activityId === "A004")!;
    expect(a001.predecessorActivityId).toBeNull();
    expect(a004.predecessorActivityId).toBe("A003");
  });

  it("carries the buffer rules that size each nature's exclusion zone", () => {
    const live = instance.bufferRules.find((b) => b.natureOfWorks === "Live")!;
    const others = instance.bufferRules.find(
      (b) => b.natureOfWorks === "Non-live (Others)",
    )!;
    expect(live).toMatchObject({ upToBufferSectors: 2, oppositeBoundRequired: true });
    expect(others).toMatchObject({ upToBufferSectors: 0, oppositeBoundRequired: false });
  });

  it("keeps each line's interchange sectors distinct", () => {
    // Alpha and Beta both run H01 to H02, but they are physically two adjacent
    // tunnels with independent capacity. Collapsing them would silently halve
    // the network's interchange supply.
    const ids = instance.sectors.map((s) => s.sectorId);
    expect(ids).toContain("SEC:ALP:H01_H02");
    expect(ids).toContain("SEC:BET:H01_H02");
  });

  it("rejects a missing file rather than loading a partial instance", () => {
    const rest = Object.fromEntries(
      Object.entries(files).filter(([name]) => name !== "08_ACTIVITY_DETAILS.csv"),
    );
    expect(() => loadInstance(rest)).toThrow(/08_ACTIVITY_DETAILS/);
  });

  it("rejects an unparseable number rather than silently producing NaN", () => {
    const broken = { ...files, "06_PARAMETERS.csv": "key,value\nhorizon_start,2027-01-04\nhorizon_weeks,many\n" };
    expect(() => loadInstance(broken)).toThrow(/horizon_weeks/);
  });

  it("rejects an unknown nature of works", () => {
    const broken = {
      ...files,
      "05_BUFFER_LOCATION.csv":
        "nature_of_works,up_to_buffer_sectors,opposite_bound_required\nSomewhat live,2,1\n",
    };
    expect(() => loadInstance(broken)).toThrow(/Somewhat live/);
  });
});
