import { describe, expect, it } from "vitest";
import { stationGeography } from "@/lib/geography/snapshot";
import {
  buildInstanceFromLiterals,
  instanceDigest,
} from "@railplan/core/domain/instance";
import { buildWorld } from "@railplan/core/domain/world";
import { solve } from "@railplan/core/engine/solve";
import { validate } from "@railplan/core/engine/validate";

describe("public geography is presentation only", () => {
  it("cannot change planning facts, solver placements or feasibility", () => {
    const before = buildInstanceFromLiterals();
    const baseline = solve({
      strategy: "balanced",
      context: { world: buildWorld(before) },
    });
    const original = stationGeography.stations[0].longitude;
    try {
      stationGeography.stations[0].longitude = original + 0.01;
      const after = buildInstanceFromLiterals();
      const result = solve({
        strategy: "balanced",
        context: { world: buildWorld(after) },
      });
      expect(instanceDigest(after)).toBe(instanceDigest(before));
      expect(result.inputHash).toBe(baseline.inputHash);
      expect(result.plan).toEqual(baseline.plan);
      expect(result.status).toBe(baseline.status);
      expect(validate(result.plan, { world: buildWorld(after) })).toEqual(
        baseline.violations,
      );
    } finally {
      stationGeography.stations[0].longitude = original;
    }
  });
});
