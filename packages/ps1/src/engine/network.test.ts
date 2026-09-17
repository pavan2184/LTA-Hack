// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadInstance, PS1_FILES } from "../io/load";
import { buildNetwork, expandSpan, closureFor, parseLocationId } from "./network";

const dir = resolve("packages/ps1/data/public");
const instance = loadInstance(
  Object.fromEntries(PS1_FILES.map((n) => [n, readFileSync(resolve(dir, n), "utf8")])),
);
const network = buildNetwork(instance);

/** The sample submission's occupancy, grouped by activity — the golden answer. */
function sampleOccupancy(): Map<string, Set<string>> {
  const text = readFileSync(
    resolve("packages/ps1/data/sample-submission/SCHEDULE_OCCUPANCY.csv"),
    "utf8",
  );
  const byActivity = new Map<string, Set<string>>();
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [activityId, , locationId] = line.split(",");
    const set = byActivity.get(activityId) ?? new Set<string>();
    set.add(locationId);
    byActivity.set(activityId, set);
  }
  return byActivity;
}

describe("location identifiers", () => {
  it("reads a tunnel sector", () => {
    expect(parseLocationId("SEC:ALP:S02_S03:EB")).toEqual({
      kind: "SEC",
      lineCode: "ALP",
      bound: "EB",
      fromStationId: "S02",
      toStationId: "S03",
    });
  });

  it("reads a platform", () => {
    expect(parseLocationId("PLAT:BET:H01:WB")).toEqual({
      kind: "PLAT",
      lineCode: "BET",
      bound: "WB",
      stationId: "H01",
    });
  });

  it("rejects a malformed id rather than guessing", () => {
    expect(() => parseLocationId("SEC:ALP:S02_S03")).toThrow(/SEC:ALP:S02_S03/);
  });
});

describe("span expansion", () => {
  /**
   * The strongest check available: the brief ships a reference submission it
   * states is feasible with zero violations, so its occupancy rows are the
   * published answer for what each activity occupies. Reproducing them exactly,
   * for all 54 activities, verifies the expansion rule against the organisers'
   * own tool rather than against my reading of the prose.
   */
  it("reproduces the reference submission's occupancy for every activity", () => {
    const golden = sampleOccupancy();
    const mismatches: string[] = [];
    for (const activity of instance.activities) {
      const expected = golden.get(activity.activityId);
      if (!expected) continue;
      const actual = new Set(
        expandSpan(network, activity.startLocationId, activity.endLocationId),
      );
      const missing = [...expected].filter((id) => !actual.has(id));
      const extra = [...actual].filter((id) => !expected.has(id));
      if (missing.length || extra.length) {
        mismatches.push(
          `${activity.activityId}: missing ${JSON.stringify(missing)} extra ${JSON.stringify(extra)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("books both endpoints' platforms for a single-sector activity", () => {
    expect(new Set(expandSpan(network, "SEC:ALP:S01_S02:EB", "SEC:ALP:S01_S02:EB"))).toEqual(
      new Set(["SEC:ALP:S01_S02:EB", "PLAT:ALP:S01:EB", "PLAT:ALP:S02:EB"]),
    );
  });

  it("expands in either direction, so endpoint order does not matter", () => {
    const forward = new Set(expandSpan(network, "SEC:ALP:S01_S02:EB", "SEC:ALP:S03_S04:EB"));
    const backward = new Set(expandSpan(network, "SEC:ALP:S03_S04:EB", "SEC:ALP:S01_S02:EB"));
    expect(forward).toEqual(backward);
  });
});

describe("closures and buffers", () => {
  it("adds no buffer for Non-live (Others)", () => {
    const occupied = expandSpan(network, "SEC:ALP:S02_S03:EB", "SEC:ALP:S02_S03:EB");
    expect(new Set(closureFor(network, occupied, "Non-live (Others)"))).toEqual(
      new Set(occupied),
    );
  });

  it("extends one sector each side for Non-live (Consist), same bound only", () => {
    const closure = new Set(
      closureFor(
        network,
        expandSpan(network, "SEC:ALP:S02_S03:EB", "SEC:ALP:S02_S03:EB"),
        "Non-live (Consist)",
      ),
    );
    expect(closure).toContain("SEC:ALP:S01_S02:EB");
    expect(closure).toContain("SEC:ALP:S03_S04:EB");
    expect(closure).not.toContain("SEC:ALP:S04_H01:EB");
    // The opposite bound is untouched: only Live mirrors.
    expect([...closure].some((id) => id.endsWith(":WB"))).toBe(false);
  });

  it("extends two sectors each side for Live and mirrors the opposite bound", () => {
    const closure = new Set(
      closureFor(
        network,
        expandSpan(network, "SEC:ALP:S03_S04:EB", "SEC:ALP:S03_S04:EB"),
        "Live",
      ),
    );
    expect(closure).toContain("SEC:ALP:S01_S02:EB");
    expect(closure).toContain("SEC:ALP:H01_H02:EB");
    expect(closure).toContain("SEC:ALP:S03_S04:WB");
    expect(closure).toContain("PLAT:ALP:S03:WB");
  });

  it("crosses to the other line's interchange tunnel for Live only", () => {
    const live = new Set(
      closureFor(
        network,
        expandSpan(network, "SEC:ALP:H01_H02:EB", "SEC:ALP:H01_H02:EB"),
        "Live",
      ),
    );
    // Cutting traction power at the interchange closes both lines' tunnels.
    expect(live).toContain("SEC:BET:H01_H02:EB");
    expect(live).toContain("SEC:BET:H01_H02:WB");
    expect(live).toContain("PLAT:BET:H01:EB");
    expect(live).toContain("PLAT:BET:H02:WB");

    const consist = new Set(
      closureFor(
        network,
        expandSpan(network, "SEC:ALP:H01_H02:EB", "SEC:ALP:H01_H02:EB"),
        "Non-live (Consist)",
      ),
    );
    // Every other nature stays confined to its own line.
    expect([...consist].some((id) => id.includes(":BET:"))).toBe(false);
  });

  it("stops the buffer at the end of the line rather than running off it", () => {
    const closure = closureFor(
      network,
      expandSpan(network, "SEC:ALP:S01_S02:EB", "SEC:ALP:S01_S02:EB"),
      "Live",
    );
    expect(closure.every((id) => network.supply.has(id))).toBe(true);
  });
});
