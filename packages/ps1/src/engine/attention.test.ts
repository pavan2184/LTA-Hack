// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "../io/load";
import { scheduleInstance } from "./schedule";
import { validate } from "./validate";
import { buildAttentionItems } from "./attention";

const instance = loadInstance(
  Object.fromEntries(
    PS1_FILES.map((name) => [name, readFileSync(resolve("packages/ps1/data/public", name), "utf8")]),
  ),
);
const submission = scheduleInstance(instance, { scenario: "A" });

describe("PS1 attention queue", () => {
  it("is deterministic and orders exceptions before normal activities", () => {
    const input = {
      instance,
      submission,
      report: validate(instance, submission),
      rejectedPins: [{ activityId: instance.activities[0].activityId, week: 1, reason: "fixture" }],
    };
    const first = buildAttentionItems(input);
    const second = buildAttentionItems(input);

    expect(first).toEqual(second);
    expect(first[0].kind).toBe("rejected-constraint");
    expect(first.findIndex((item) => item.severity === "normal")).toBeGreaterThan(0);
  });

  it("surfaces disruption-adjusted hotspots with linked entities", () => {
    const occupancy = submission.occupancy[0];
    const items = buildAttentionItems({
      instance,
      submission,
      report: validate(instance, submission),
      disruptions: [{
        locationId: occupancy.locationId,
        fromWeek: occupancy.week,
        toWeek: occupancy.week,
        capacity: 0,
      }],
    });
    const item = items.find(
      (candidate) =>
        candidate.kind === "disruption" &&
        candidate.locationIds.includes(occupancy.locationId) &&
        candidate.weeks.includes(occupancy.week),
    );

    expect(item).toBeDefined();
    expect(item?.activityIds).toContain(occupancy.activityId);
    expect(item?.severity).toBe("critical");
  });

  it("reports missing activity workload as blocking", () => {
    const activityId = instance.activities[0].activityId;
    const partial = {
      ...submission,
      access: submission.access.filter((row) => row.activityId !== activityId),
      occupancy: submission.occupancy.filter((row) => row.activityId !== activityId),
    };
    const items = buildAttentionItems({
      instance,
      submission: partial,
      report: validate(instance, partial),
    });

    expect(items).toContainEqual(
      expect.objectContaining({ kind: "unscheduled", severity: "blocking", activityIds: [activityId] }),
    );
  });
});
