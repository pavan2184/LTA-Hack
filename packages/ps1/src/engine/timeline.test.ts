// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "../io/load";
import { scheduleInstance } from "./schedule";
import { buildTimeline } from "./timeline";

const instance = loadInstance(
  Object.fromEntries(
    PS1_FILES.map((n) => [n, readFileSync(resolve("packages/ps1/data/public", n), "utf8")]),
  ),
);
const submission = scheduleInstance(instance, { scenario: "A" });
const timeline = buildTimeline(instance, submission);

describe("timeline", () => {
  it("covers the whole horizon", () => {
    expect(timeline.weeks[0]).toBe(1);
    expect(timeline.weeks.length).toBeGreaterThanOrEqual(instance.parameters.horizonWeeks);
  });

  it("accounts for every location exactly once", () => {
    const all = [...timeline.rows, ...timeline.emptyRows].map((row) => row.locationId);
    expect(new Set(all).size).toBe(instance.locationSupply.length);
    expect(all).toHaveLength(instance.locationSupply.length);
  });

  it("separates used rows from empty ones so the default view is not mostly blank", () => {
    expect(timeline.rows.length).toBeGreaterThan(0);
    for (const row of timeline.rows) expect(row.cells.size).toBeGreaterThan(0);
    for (const row of timeline.emptyRows) expect(row.cells.size).toBe(0);
  });

  it("counts possessions, not activity placements", () => {
    // Capacity limits possessions; counting placements would show phantom
    // overload wherever co-sharing is working as intended.
    for (const row of timeline.rows) {
      for (const cell of row.cells.values()) {
        expect(cell.possessions).toBeLessThanOrEqual(cell.activityIds.length);
        expect(cell.capacity).toBe(row.capacity);
        expect(cell.nominalCapacity).toBe(row.capacity);
        expect(cell.effectiveCapacity).toBe(row.capacity);
        expect(cell.disrupted).toBe(false);
      }
    }
  });

  it("uses the shared disruption capacity for affected location-weeks", () => {
    const row = timeline.rows.find((candidate) => candidate.cells.size > 0)!;
    const cell = [...row.cells.values()][0];
    const reduced = Math.max(0, row.capacity - 1);
    const disrupted = buildTimeline(instance, submission, undefined, [
      { locationId: row.locationId, fromWeek: cell.week, toWeek: cell.week, capacity: reduced },
    ]);
    const next = disrupted.rows
      .find((candidate) => candidate.locationId === row.locationId)!
      .cells.get(cell.week)!;

    expect(next.nominalCapacity).toBe(row.capacity);
    expect(next.effectiveCapacity).toBe(reduced);
    expect(next.capacity).toBe(reduced);
    expect(next.disrupted).toBe(true);
  });

  it("never reports load above 1 for a scenario A schedule", () => {
    // A hard-fails any capacity excess, so a feasible A schedule cannot exceed.
    expect(timeline.maxLoad).toBeLessThanOrEqual(1);
  });

  it("orders rows the way the network runs", () => {
    const alphaEb = timeline.rows.filter((r) => r.lineCode === "ALP" && r.bound === "EB");
    const seqs = alphaEb.map((r) => r.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  it("shows overflow weeks rather than cropping work off the edge", () => {
    const last = Math.max(...submission.access.map((row) => row.week));
    expect(Math.max(...timeline.weeks)).toBeGreaterThanOrEqual(last);
  });
});
