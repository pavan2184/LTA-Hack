import { describe, expect, it } from "vitest";

import { requests } from "@/data/requests";
import {
  blockAdjacency,
  blockDistance,
  blockById,
  blocksWithin,
  expandSector,
  sectorLabel,
  trackBlocks,
} from "@/domain/network";
import { equipmentById, teamById } from "@/domain/resources";

describe("network topology", () => {
  it("expands a sector into its atomic blocks", () => {
    expect(expandSector("NS10-NS12")).toEqual(["NS10-NS11", "NS11-NS12"]);
    expect(expandSector("NS10-NS13")).toEqual(["NS10-NS11", "NS11-NS12", "NS12-NS13"]);
    expect(expandSector("CC10-CC11")).toEqual(["CC10-CC11"]);
  });

  it("accepts an en dash as well as a hyphen", () => {
    expect(expandSector("EW18–EW20")).toEqual(expandSector("EW18-EW20"));
  });

  it("rejects ranges that cannot exist rather than planning against nothing", () => {
    expect(() => expandSector("NS10-EW20")).toThrow(/crosses lines/);
    expect(() => expandSector("NS10-NS10")).toThrow(/zero length/);
    expect(() => expandSector("ZZ01-ZZ02")).toThrow(/Unknown station/);
  });

  it("round-trips block ids back to a sector label", () => {
    expect(sectorLabel(expandSector("NS11-NS13"))).toBe("NS11-NS13");
  });

  /**
   * The reason atomic blocks exist. Two requests whose labels share no station
   * still collide on real track, and string comparison cannot see it.
   */
  it("detects a shared block between sectors with different labels", () => {
    const a = expandSector("NS10-NS12");
    const b = expandSector("NS11-NS13");
    expect(a).not.toEqual(b);
    expect(a.filter((id) => b.includes(id))).toEqual(["NS11-NS12"]);
    expect(blockDistance(a, b)).toBe(0);
  });

  it("measures graph distance between blocks", () => {
    expect(blockDistance(["NS10-NS11"], ["NS11-NS12"])).toBe(1);
    expect(blockDistance(["NS10-NS11"], ["NS12-NS13"])).toBe(2);
    // Lines are not joined in the block graph, so there is no rail path.
    expect(blockDistance(["NS10-NS11"], ["EW18-EW19"])).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps adjacency symmetric", () => {
    trackBlocks.forEach((block) => {
      blockAdjacency[block.id].forEach((neighbour) => {
        expect(blockAdjacency[neighbour]).toContain(block.id);
      });
    });
  });

  it("excludes the source blocks from a neighbourhood", () => {
    const source = expandSector("NS11-NS13");
    const near = blocksWithin(source, 1);
    source.forEach((id) => expect(near).not.toContain(id));
    expect(near).toContain("NS10-NS11");
    expect(near).toContain("NS13-NS14");
  });
});

describe("request dataset", () => {
  it("has 22 requests with unique ids", () => {
    expect(requests).toHaveLength(22);
    expect(new Set(requests.map((request) => request.id)).size).toBe(22);
  });

  it("references only real blocks, teams and equipment", () => {
    requests.forEach((request) => {
      request.blockIds.forEach((id) => expect(blockById[id], `${request.id} block ${id}`).toBeDefined());
      expect(teamById[request.teamId], `${request.id} team`).toBeDefined();
      request.equipment.forEach((demand) =>
        expect(equipmentById[demand.equipmentId], `${request.id} equipment`).toBeDefined(),
      );
    });
  });

  it("assigns every request to a team that holds its required skills", () => {
    requests.forEach((request) => {
      const team = teamById[request.teamId];
      request.requiredSkills.forEach((skill) =>
        expect(team.skills, `${request.id} needs ${skill}`).toContain(skill),
      );
    });
  });

  it("fits every request inside its own permitted window", () => {
    requests.forEach((request) => {
      expect(request.earliestStart + request.durationMinutes).toBeLessThanOrEqual(request.latestEnd);
    });
  });

  it("points dependencies at requests that exist", () => {
    const ids = new Set(requests.map((request) => request.id));
    requests.forEach((request) =>
      request.dependencies.forEach((id) => expect(ids.has(id), `${request.id} -> ${id}`).toBe(true)),
    );
  });
});
