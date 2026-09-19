// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLOSURE_MODEL_VERSION } from "@railplan/ps1/engine/closure";
import { buildNetwork, expandSpan } from "@railplan/ps1/engine/network";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import type { AccessRow, OccupancyRow } from "@railplan/ps1/types/ps1";
import { checkedCpSatResult, cpSatPayload, NativeModelSizeError, type CpSatResult } from "./cp-sat-model";

const base = loadInstance(Object.fromEntries(PS1_FILES.map((name) => [name,
  readFileSync(resolve("packages/ps1/data/synthetic/01-small-demo", name), "utf8")])));

function coWorkers(count = 2) {
  const instance = structuredClone(base);
  instance.contracts = [{ ...base.contracts[0], accessType: "C", numberOfWorkfronts: count }];
  instance.activities = Array.from({ length: count }, (_, index) => ({ ...base.activities[0],
    activityId: `work-${index}`, totalAccesses: 1, contractNumber: instance.contracts[0].contractNumber }));
  instance.locationSupply.forEach((location) => { location.supplyCapacity = 2; });
  return instance;
}

function nativeCandidate() {
  const instance = coWorkers();
  const payload = cpSatPayload(instance, { scenario: "A", seconds: 1 });
  const network = buildNetwork(instance);
  const access: AccessRow[] = instance.activities.map((activity) => ({ activityId: activity.activityId,
    accessSeq: 1, week: 1, eclo: 0, accessNight: 1 }));
  const occupancy: OccupancyRow[] = instance.activities.flatMap((activity, index) =>
    expandSpan(network, activity.startLocationId, activity.endLocationId).map((locationId) => ({
      activityId: activity.activityId, week: 1, locationId, coShareGroup: `native-group-${index}`,
    })));
  const raw: CpSatResult = { schema: payload.schema, closureModelVersion: CLOSURE_MODEL_VERSION,
    digest: payload.digest, scenario: "A", scope: "full", status: "OPTIMAL", ortoolsVersion: "test",
    objective: 0, bound: 0, solveMs: 1, modelAndSolveMs: 2, access, occupancy };
  return { instance, payload, raw };
}

describe("native closure transport", () => {
  it("requires a versioned closure model and includes geometry in provenance", () => {
    const { instance, payload } = nativeCandidate();
    expect(payload.closureModelVersion).toBe(CLOSURE_MODEL_VERSION);
    expect(payload.closurePairs).toEqual([]);
    const changed = structuredClone(instance);
    changed.contracts[0].accessType = "PM";
    const hosted = cpSatPayload(changed, { scenario: "A", seconds: 1 });
    expect(hosted.closurePairs).toContainEqual(["work-0", "work-1"]);
    expect(hosted.digest).not.toBe(payload.digest);
  });

  it("preserves solved local groups instead of greedily repacking native access rows", () => {
    const { payload, raw } = nativeCandidate();
    const result = checkedCpSatResult(payload, raw);
    expect(result.report?.feasible).toBe(true);
    expect(result.submission?.occupancy).toEqual(raw.occupancy);
    expect(new Set(result.submission?.occupancy.map((row) => row.coShareGroup)).size).toBe(2);
  });

  it("rejects old binaries, missing occupancy, and fabricated occupancy coverage", () => {
    const { payload, raw } = nativeCandidate();
    for (const mutation of [{ closureModelVersion: undefined }, { closureModelVersion: "old" }, { occupancy: undefined }]) {
      expect(() => checkedCpSatResult(payload, { ...raw, ...mutation })).toThrow(/provenance/);
    }
    expect(() => checkedCpSatResult(payload, { ...raw, occupancy: raw.occupancy.slice(1) }))
      .toThrow(/local CSV/);
  });

  it("rejects dense sharing instances before constructing the combinatorial native model", () => {
    const dense = coWorkers(400);
    expect(() => cpSatPayload(dense, { scenario: "A", seconds: 60 })).toThrow(NativeModelSizeError);
  });

  it("rejects potential closure-pair explosions before computing geometry", () => {
    const dense = coWorkers(400);
    dense.parameters.horizonWeeks = 1;
    dense.contracts[0].accessType = "PM";
    // 159,600 eligible directed pairs, but almost no sharing assignments.
    expect(() => cpSatPayload(dense, { scenario: "A", seconds: 60 })).toThrow(NativeModelSizeError);
  });

  it.each(["03-live-interchange", "06-mixed-120", "12-mixed-240"])(
    "keeps existing %s inputs within the conservative construction budget", (name) => {
      const instance = loadInstance(Object.fromEntries(PS1_FILES.map((file) => [file,
        readFileSync(resolve("packages/ps1/data/synthetic", name, file), "utf8")])));
      expect(() => cpSatPayload(instance, { scenario: "C", seconds: 5 })).not.toThrow();
    });
});
