// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CLOSURE_MODEL_VERSION } from "@railplan/ps1/engine/closure";
import { buildNetwork, expandSpan } from "@railplan/ps1/engine/network";
import { validate } from "@railplan/ps1/engine/validate";
import { validateInstance } from "@railplan/ps1/io/load";
import { parseSubmission } from "@railplan/ps1/io/submission";
import { writeSubmission } from "@railplan/ps1/io/write";
import { generateStressInstances, STRESS_MANIFEST } from "./stress-instances";

const cases = generateStressInstances();
const recorded = JSON.parse(readFileSync("scripts/ps1/benchmark/stress-results.json", "utf8")) as {
  cohorts: { config: { datasets: { id: string; inputSha256: string }[] } }[];
};
const recordedHashes = new Map(recorded.cohorts.flatMap((cohort) => cohort.config.datasets)
  .map((dataset) => [dataset.id, dataset.inputSha256]));

describe("declared PS1 stress instances", () => {
  it("keeps four development and four holdout definitions with disjoint fixed seeds", () => {
    expect(STRESS_MANIFEST.filter((entry) => entry.split === "development")).toHaveLength(4);
    expect(STRESS_MANIFEST.filter((entry) => entry.split === "holdout")).toHaveLength(4);
    expect(new Set(STRESS_MANIFEST.map((entry) => entry.seed)).size).toBe(8);
    expect(new Set(cases.map((entry) => entry.metadata.instanceSha256)).size).toBe(8);
    expect(Object.isFrozen(STRESS_MANIFEST)).toBe(true);
    expect(STRESS_MANIFEST.every(Object.isFrozen)).toBe(true);
    expect(cases.map((entry) => entry.id)).toEqual(STRESS_MANIFEST.map((entry) => entry.id));
  });

  it("replays exactly and returns independent mutable instance copies", () => {
    const repeated = generateStressInstances("development");
    expect(repeated).toEqual(cases.filter((entry) => entry.split === "development"));
    repeated[0].instance.activities[0].totalAccesses = 999;
    expect(generateStressInstances("development")[0].instance.activities[0].totalAccesses).not.toBe(999);
  });

  it("preserves every benchmarked v1 input instead of retuning invalid holdouts", () => {
    for (const entry of cases) expect(entry.metadata.instanceSha256, entry.id).toBe(recordedHashes.get(entry.id));
  });

  for (const entry of cases) {
    it(`${entry.id}: quarantines the original full-workload witness with its closure failures`, () => {
      const { instance } = entry;
      expect(() => validateInstance(instance)).not.toThrow();
      expect(instance.activities.length).toBeGreaterThanOrEqual(50);
      expect(instance.activities.length).toBeLessThanOrEqual(120);
      for (const scenario of ["A", "C"] as const) {
        expect(entry.witnesses[scenario]).toBeUndefined();
        expect(entry.metadata.certificateStatus[scenario]).toBe("quarantined");
        const csv = writeSubmission(entry.quarantinedWitnesses[scenario]!);
        const decoded = parseSubmission({ access: csv["SCHEDULE_ACCESS.csv"],
          occupancy: csv["SCHEDULE_OCCUPANCY.csv"], results: csv["RESULTS.csv"] });
        const report = validate(instance, decoded);
        expect(report.hardViolations.length).toBeGreaterThan(0);
        expect(report.hardViolations.every((failure) => failure.rule === "closure")).toBe(true);
        expect(report.hardViolations).toEqual(entry.metadata.certificateFailures[scenario]);
        expect(report.feasible).toBe(false);
        expect(report.objectiveScore).toBeUndefined();
        expect(entry.metadata.witnessScores[scenario]).toBeNull();
        expect(decoded.access.every((row) => row.eclo === 0)).toBe(true);
        for (const activity of instance.activities) {
          expect(decoded.access.filter((row) => row.activityId === activity.activityId)).toHaveLength(activity.totalAccesses);
        }
      }
      expect(entry.metadata.certificateScope).toBe("local_checker_only");
      expect(entry.metadata.certificateClosureModelVersion).toBe(CLOSURE_MODEL_VERSION);
      expect(entry.metadata.witnessPolicy).toBe("verification_only_not_solver_hints");
      expect(entry.metadata.scenarioBFeasibility).toBe("not_certified_keep_all_outcomes");
    });
  }

  it("includes shared-location pressure, cross-contract precedence, all priority tiers and Live coupling", () => {
    for (const entry of cases) {
      const { instance, metadata } = entry;
      expect(metadata.counts.predecessorEdges).toBeGreaterThan(instance.activities.length / 2);
      expect(metadata.counts.crossContractEdges).toBeGreaterThan(0);
      expect(new Set(instance.contracts.map((contract) => contract.contractPriority)).size).toBe(3);
      expect(new Set(instance.activities.map((activity) => activity.activityPriority)).size).toBe(3);
      expect(new Set(instance.contracts.map((contract) => contract.accessType))).toEqual(new Set(["PM", "PC", "C"]));
      expect(metadata.counts.maximumSupply).toBeGreaterThan(metadata.counts.minimumSupply);
      const network = buildNetwork(instance);
      const spans = instance.activities.map((activity) => expandSpan(network, activity.startLocationId, activity.endLocationId));
      expect(spans.some((span, index) => spans.some((other, otherIndex) =>
        index !== otherIndex && span.some((location) => other.includes(location))))).toBe(true);
      if (metadata.family === "live-interchange" || metadata.family === "mixed-spans") {
        expect(metadata.counts.liveCrossLineActivities).toBeGreaterThan(0);
        expect(metadata.counts.liveCrossLineActivities).toBe(metadata.counts.liveActivities);
      }
    }
  });
});
