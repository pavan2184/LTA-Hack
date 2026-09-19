// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "../../data/synthetic/manifest.json";
import { buildNetwork, closureFor, expandSpan } from "../engine/network";
import { solveInstance } from "../engine/schedule";
import { validate } from "../engine/validate";
import type { Scenario } from "../types/ps1";
import { loadInstance, PS1_FILES } from "./load";
import { parseSubmission, SUBMISSION_FILES } from "./submission";
import { writeSubmission } from "./write";

const root = resolve("packages/ps1/data/synthetic");
const scenarios: Scenario[] = ["A", "B", "C"];
const fixtures = manifest.datasets.map((entry) => {
  const dir = resolve(root, entry.id);
  const files = Object.fromEntries(
    PS1_FILES.map((name) => [name, readFileSync(resolve(dir, name), "utf8")]),
  );
  return { ...entry, dir, files, instance: loadInstance(files) };
});

it("preserves the published source instance recorded in the manifest", () => {
  for (const name of PS1_FILES) {
    const bytes = readFileSync(resolve("packages/ps1/data/public", name));
    expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(
      manifest.sourceSha256[name],
    );
  }
});

describe.each(fixtures)("synthetic input $id", (fixture) => {
  it("contains exactly eight upload files and the documented complete demand", () => {
    expect(readdirSync(fixture.dir).sort()).toEqual([...PS1_FILES].sort());
    const { instance } = fixture;
    expect(instance.contracts).toHaveLength(fixture.contracts);
    expect(instance.activities).toHaveLength(fixture.activities);
    expect(instance.activities.reduce((sum, row) => sum + row.totalAccesses, 0)).toBe(
      fixture.totalAccesses,
    );
    expect(instance.activities.filter((row) => row.predecessorActivityId)).toHaveLength(
      fixture.dependencyLinks,
    );
    expect(instance.parameters).toEqual({
      horizonStart: manifest.horizonStart,
      horizonWeeks: manifest.horizonWeeks,
    });
    for (const name of ["01_LINES.csv", "02_STATIONS.csv", "03_SECTORS.csv", "05_BUFFER_LOCATION.csv", "06_PARAMETERS.csv"] as const) {
      expect(fixture.files[name]).toBe(
        readFileSync(resolve("packages/ps1/data/public", name), "utf8"),
      );
    }
    for (const contract of instance.contracts) {
      expect(contract.numberOfMaximumAccessPerWeek).toBe(
        contract.natureOfActivity === "Live" ? 2 : 3,
      );
    }
    const network = buildNetwork(instance);
    for (const activity of instance.activities) {
      const span = expandSpan(network, activity.startLocationId, activity.endLocationId);
      expect(span.length).toBeGreaterThanOrEqual(3);
      expect(span.every((location) => network.supply.has(location))).toBe(true);
    }
  });

  it.each(scenarios)("delivers all work and round-trips valid Scenario %s output", (scenario) => {
    const outcome = solveInstance(fixture.instance, { scenario });
    expect(outcome.status, JSON.stringify(outcome.diagnostics)).toBe(
      fixture.expectedScenarios[scenario],
    );
    expect(outcome.submission).toBeDefined();
    const csv = writeSubmission(outcome.submission!);
    expect(Object.keys(csv).sort()).toEqual([...SUBMISSION_FILES].sort());
    const submission = parseSubmission({
      access: csv["SCHEDULE_ACCESS.csv"],
      occupancy: csv["SCHEDULE_OCCUPANCY.csv"],
      results: csv["RESULTS.csv"],
    });
    const report = validate(fixture.instance, submission);
    expect(report.hardViolations).toEqual([]);
    expect(report.feasible).toBe(true);
    expect(report.conformance.mode).toBe("local");
    expect(submission.results).toHaveLength(fixture.contracts);
    expect(new Set(submission.results.map((row) => row.scenario))).toEqual(new Set([scenario]));
    expect(new Set(submission.access.map((row) => row.activityId)).size).toBe(fixture.activities);

    // Check workload and FS+0 directly as well as through the local checker.
    for (const activity of fixture.instance.activities) {
      const access = submission.access.filter((row) => row.activityId === activity.activityId);
      expect(access.reduce((sum, row) => sum + (row.eclo ? 1.5 : 1), 0)).toBeGreaterThanOrEqual(
        activity.totalAccesses,
      );
      if (activity.predecessorActivityId) {
        const preceding = submission.access.filter((row) => row.activityId === activity.predecessorActivityId);
        expect(Math.min(...access.map((row) => row.week))).toBeGreaterThan(
          Math.max(...preceding.map((row) => row.week)),
        );
      }
    }

    if (fixture.id === "02-co-sharing" && scenario === "A") {
      const groups = new Map<string, Set<string>>();
      for (const row of submission.occupancy) {
        const key = `${row.locationId}|${row.week}|${row.coShareGroup}`;
        const members = groups.get(key) ?? new Set<string>();
        members.add(row.activityId);
        groups.set(key, members);
      }
      expect(Math.max(...[...groups.values()].map((members) => members.size))).toBe(4);
      expect(report.softScores.overrunDaysTotal).toBe(0);
      expect(report.softScores.excessAccessNightsTotal).toBe(0);
    }

    if (fixture.id === "05-capacity-pressure") {
      if (scenario === "A") {
        expect(report.softScores.overrunDaysTotal).toBeGreaterThan(0);
        expect(report.softScores.excessAccessNightsTotal).toBe(0);
        expect(report.softScores.ecloNightsTotal).toBe(0);
      } else {
        expect(report.softScores.excessAccessNightsTotal).toBeGreaterThan(0);
        expect(report.softScores.ecloNightsTotal).toBeGreaterThan(0);
        if (scenario === "B") expect(report.softScores.overrunDaysTotal).toBe(0);
        if (scenario === "C") expect(report.softScores.overrunDaysTotal).toBeGreaterThan(0);
      }
    }
  });
});

it("includes Live work that closes both lines and both bounds at the interchange", () => {
  const fixture = fixtures.find((entry) => entry.id === "03-live-interchange")!;
  const activity = fixture.instance.activities.find((row) => row.activityId === "03-A001")!;
  const contract = fixture.instance.contracts.find((row) => row.contractNumber === activity.contractNumber)!;
  expect(contract.natureOfActivity).toBe("Live");
  const network = buildNetwork(fixture.instance);
  const span = expandSpan(network, activity.startLocationId, activity.endLocationId);
  const closure = closureFor(network, span, contract.natureOfActivity);
  for (const line of ["ALP", "BET"]) {
    for (const bound of ["EB", "WB"]) {
      expect(closure).toContain(`SEC:${line}:H01_H02:${bound}`);
      expect(closure).toContain(`PLAT:${line}:H01:${bound}`);
      expect(closure).toContain(`PLAT:${line}:H02:${bound}`);
    }
  }
});
