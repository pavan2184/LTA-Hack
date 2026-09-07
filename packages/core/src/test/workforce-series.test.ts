import { describe, expect, it } from "vitest";
import { assessWorkforce } from "../engine/workforce";
import { buildWorkforceSeries } from "../engine/workforce-series";
import { buildWorld } from "../domain/world";
import { buildInstanceFromLiterals } from "../domain/instance";

describe("workforce timeline series", () => {
  it("matches independently calculated supply and demand at every slot and event boundary", () => {
    const instance = buildInstanceFromLiterals();
    const teamId = instance.teams[0].id;
    instance.workforceAvailability = [
      {
        planningNight: instance.planningNight,
        teamId,
        roleId: "technician",
        startMinute: 0,
        endMinute: 37,
        count: 3,
      },
      {
        planningNight: instance.planningNight,
        teamId,
        roleId: "technician",
        startMinute: 52,
        endMinute: 120,
        count: 1,
      },
    ];
    instance.workforceDemand = [
      { requestId: "M-001", roleId: "technician", count: 2 },
      { requestId: "M-002", roleId: "technician", count: 2 },
    ];
    const plan = {
      placements: [
        {
          requestId: "M-001",
          teamId,
          startMinute: 15,
          endMinute: 60,
          locked: false,
        },
        {
          requestId: "M-002",
          teamId,
          startMinute: 30,
          endMinute: 75,
          locked: false,
        },
      ],
      deferred: [],
    };
    const rows = buildWorkforceSeries(
      assessWorkforce(plan, { world: buildWorld(instance) }),
      { teamId, roleId: "technician", start: 0, end: 135, slotMinutes: 15 },
    );
    expect(rows.map((row) => row.start)).toEqual([
      0, 15, 30, 37, 45, 52, 60, 75, 90, 105, 120,
    ]);
    for (const row of rows) {
      const demand =
        (row.start >= 15 && row.start < 60 ? 2 : 0) +
        (row.start >= 30 && row.start < 75 ? 2 : 0);
      const available =
        row.start < 37 ? 3 : row.start >= 52 && row.start < 120 ? 1 : 0;
      expect(row).toMatchObject({
        demand,
        available,
        remaining: available - demand,
        shortfall: Math.max(0, demand - available),
      });
    }
    expect(rows.find((row) => row.start === 37)?.requestIds).toEqual([
      "M-001",
      "M-002",
    ]);
    expect(rows.find((row) => row.start === 60)?.requestIds).toEqual(["M-002"]);
    expect(rows.at(-1)).toMatchObject({
      start: 120,
      end: 135,
      available: 0,
      demand: 0,
    });
  });

  it("isolates team and role rather than masking shortages with other capacity", () => {
    const assessment = {
      intervals: [
        {
          teamId: "a",
          roleId: "r",
          start: 0,
          end: 30,
          demand: 4,
          available: 1,
          shortfall: 3,
          requestIds: ["job"],
        },
        {
          teamId: "b",
          roleId: "r",
          start: 0,
          end: 30,
          demand: 0,
          available: 20,
          shortfall: 0,
          requestIds: [],
        },
      ],
      shortages: [],
      missingRequestIds: [],
      personMinutesUsed: 120,
      personMinutesAvailable: 630,
    };
    const rows = buildWorkforceSeries(assessment, {
      teamId: "a",
      roleId: "r",
      start: 5,
      end: 25,
      slotMinutes: 15,
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.remaining === -3 && row.end <= 25)).toBe(
      true,
    );
    expect(
      buildWorkforceSeries(assessment, {
        teamId: "a",
        roleId: "absent",
        start: 0,
        end: 30,
        slotMinutes: 15,
      }).every((row) => row.demand === 0 && row.available === 0),
    ).toBe(true);
  });

  it("rejects invalid plotting bounds without looping", () => {
    const assessment = {
      intervals: [],
      shortages: [],
      missingRequestIds: [],
      personMinutesUsed: 0,
      personMinutesAvailable: 0,
    };
    for (const slotMinutes of [0, -1, Infinity, NaN])
      expect(() =>
        buildWorkforceSeries(assessment, {
          teamId: "a",
          roleId: "r",
          start: 0,
          end: 30,
          slotMinutes,
        }),
      ).toThrow();
  });
});
