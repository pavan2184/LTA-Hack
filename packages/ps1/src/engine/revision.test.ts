// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "../io/load";
import { scheduleInstance } from "./schedule";
import { validate } from "./validate";
import { comparePlans, planningLogJson } from "./revision";

const instance = loadInstance(
  Object.fromEntries(
    PS1_FILES.map((name) => [name, readFileSync(resolve("packages/ps1/data/public", name), "utf8")]),
  ),
);

describe("PS1 reviewed revisions", () => {
  it("reports score and schedule churn", () => {
    const before = scheduleInstance(instance, { scenario: "A" });
    const first = before.access[0];
    const after = scheduleInstance(instance, {
      scenario: "A",
      pins: [{ activityId: first.activityId, week: Math.min(instance.parameters.horizonWeeks, first.week + 1) }],
    });
    const diff = comparePlans(before, validate(instance, before), after, validate(instance, after));
    expect(diff.movedActivityIds).toContain(first.activityId);
    expect(diff.movedAccesses).toBeGreaterThan(0);
  });

  it("keeps the planning log separate and versioned", () => {
    const parsed = JSON.parse(planningLogJson([{ action: "pin" }]));
    expect(parsed.version).toBe(1);
    expect(parsed.entries).toEqual([{ action: "pin" }]);
  });
});
