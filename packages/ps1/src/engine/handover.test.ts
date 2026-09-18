// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildHandoverSummary } from "./handover";
import { loadInstance, PS1_FILES } from "../io/load";
import { buildNetwork } from "./network";
import { solveInstance } from "./schedule";

describe("planning handover", () => {
  it("contains operational state but never expands the official ZIP manifest", () => {
    const instance = loadInstance(Object.fromEntries(
      PS1_FILES.map((name) => [name, readFileSync(resolve("packages/ps1/data/public", name), "utf8")]),
    ));
    const outcome = solveInstance(instance, { scenario: "C" }, buildNetwork(instance));
    expect(outcome.status).toBe("FEASIBLE");
    if (!outcome.validation) throw new Error("Expected a validated fixture plan.");
    const text = buildHandoverSummary({
      scenario: "C",
      report: outcome.validation,
      pins: [{ activityId: instance.activities[0].activityId, week: 1 }],
      disruptions: [{ locationId: instance.locationSupply[0].locationId, fromWeek: 2, toWeek: 3, capacity: 0 }],
      recentAction: "Urgent maintenance",
      diff: null,
    });
    expect(text).toContain("Scenario C");
    expect(text).toContain("Urgent maintenance");
    expect(text).toContain("cross-possession physical-night alignment");
    expect(text).toContain("RESULTS.csv, SCHEDULE_ACCESS.csv and SCHEDULE_OCCUPANCY.csv only");
    expect(text).not.toContain("PS1_PLANNING_LOG.json");
  });
});
