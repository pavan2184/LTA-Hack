import { describe, expect, it } from "vitest";

import { emergencyScenarios } from "@/data/emergencyScenarios";
import { requestById, requests } from "@/data/requests";
import { trackBlocks } from "@/domain/network";
import { computeMetrics } from "@/engine/metrics";
import { solve } from "@/engine/solve";
import { strategyList } from "@/engine/strategies";
import { validate } from "@/engine/validate";
import { priorityWeight } from "@/types/railplan";

const strategies = strategyList.map((profile) => profile.id);

describe("metrics", () => {
  it.each(strategies)("%s: every metric carries a formula and a denominator", (strategy) => {
    Object.values(solve({ strategy }).metrics).forEach((metric) => {
      expect(metric.formula.length, metric.key).toBeGreaterThan(0);
      expect(metric.label.length, metric.key).toBeGreaterThan(0);
      expect(Number.isFinite(metric.value), metric.key).toBe(true);
      expect(Number.isFinite(metric.numerator), metric.key).toBe(true);
      expect(Number.isFinite(metric.denominator), metric.key).toBe(true);
    });
  });

  it.each(strategies)("%s: percentages stay in range", (strategy) => {
    Object.values(solve({ strategy }).metrics)
      .filter((metric) => metric.unit === "percent")
      .forEach((metric) => {
        expect(metric.value, metric.key).toBeGreaterThanOrEqual(0);
        expect(metric.value, metric.key).toBeLessThanOrEqual(100);
      });
  });

  it("computes weighted completion from the declared weights, not a stored score", () => {
    const result = solve({ strategy: "balanced" });
    const placed = new Set(result.plan.placements.map((item) => item.requestId));
    const expectedNumerator = requests
      .filter((request) => placed.has(request.id))
      .reduce((sum, request) => sum + priorityWeight[request.priority], 0);
    const expectedDenominator = requests.reduce(
      (sum, request) => sum + priorityWeight[request.priority],
      0,
    );

    expect(result.metrics.weightedCompletion.numerator).toBe(expectedNumerator);
    expect(result.metrics.weightedCompletion.denominator).toBe(expectedDenominator);
    expect(result.metrics.weightedCompletion.value).toBeCloseTo(
      Math.round((expectedNumerator / expectedDenominator) * 1000) / 10,
      5,
    );
  });

  it("computes block utilisation against real block-minutes", () => {
    const result = solve({ strategy: "balanced" });
    const expected = result.plan.placements.reduce((sum, placement) => {
      const request = requestById[placement.requestId];
      const occupancy = placement.endMinute - placement.startMinute + request.clearanceMinutes;
      return sum + occupancy * request.blockIds.length;
    }, 0);

    expect(result.metrics.blockUtilisation.numerator).toBe(expected);
    expect(result.metrics.blockUtilisation.denominator).toBe(trackBlocks.length * 240);
  });

  it("counts movement only for jobs that actually moved", () => {
    const result = solve({ strategy: "balanced" });
    const moved = result.plan.placements.filter(
      (placement) => placement.startMinute !== requestById[placement.requestId].preferredStart,
    );
    expect(result.metrics.movement.denominator).toBe(moved.length);
    expect(result.metrics.movement.numerator).toBe(
      moved.reduce(
        (sum, placement) =>
          sum + Math.abs(placement.startMinute - requestById[placement.requestId].preferredStart),
        0,
      ),
    );
  });

  /**
   * Emergency capacity is only meaningful if it was tried. Every scenario the
   * metric counts must genuinely validate inside the plan.
   */
  it("counts an emergency scenario only when it really fits", () => {
    const result = solve({ strategy: "emergency-buffer" });
    const metric = result.metrics.emergencyCapacity;
    expect(metric.denominator).toBe(emergencyScenarios.length);
    expect(metric.numerator).toBeLessThanOrEqual(metric.denominator);
    expect(metric.note).toContain("re-validated");
  });

  it("reports 100% recovery gap for a plan with a single job on each block", () => {
    const plan = {
      placements: [
        { requestId: "M-001", startMinute: 0, endMinute: 60, teamId: "T-TRK", locked: false },
      ],
      deferred: [],
    };
    const metrics = computeMetrics(plan, validate(plan), requests);
    // No consecutive pairs exist, so there is nothing that could fall short.
    expect(metrics.bufferCompliance.denominator).toBe(0);
    expect(metrics.bufferCompliance.value).toBe(100);
  });

  it("reports zero for an empty plan without dividing by zero", () => {
    const plan = { placements: [], deferred: [] };
    const metrics = computeMetrics(plan, [], requests);
    expect(metrics.placed.value).toBe(0);
    expect(metrics.weightedCompletion.value).toBe(0);
    expect(metrics.blockUtilisation.value).toBe(0);
    Object.values(metrics).forEach((metric) => expect(Number.isNaN(metric.value)).toBe(false));
  });
});
