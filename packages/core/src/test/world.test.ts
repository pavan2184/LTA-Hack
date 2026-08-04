import { describe, expect, it } from "vitest";

import { buildInstanceFromLiterals } from "../domain/instance";
import {
  blockDistance,
  blocksWithin,
  sectorLabel,
  trackBlocks,
  type TrackBlock,
} from "../domain/network";
import { areWorkClassesCompatible, workClasses, type WorkClass } from "../domain/resources";
import { buildWorld, literalWorld } from "../domain/world";
import { requests } from "../data/requests";

/**
 * The world derives from an instance what the module literals compute directly.
 * These are the same answers or the refactor is a silent change of behaviour,
 * so every query is checked against its module counterpart across the whole
 * network rather than on a sample.
 */
const world = literalWorld();
const classes = Object.keys(workClasses) as WorkClass[];

describe("the derived world matches the module topology", () => {
  it("indexes the same blocks, teams, equipment and requests", () => {
    expect(world.blocks.map((b) => b.id).sort()).toEqual(trackBlocks.map((b) => b.id).sort());
    expect(Object.keys(world.requestById).sort()).toEqual(requests.map((r) => r.id).sort());
    requests.forEach((request) => expect(world.requestById[request.id]).toEqual(request));
  });

  it("answers blocksWithin identically for every block at every useful radius", () => {
    trackBlocks.forEach((block: TrackBlock) => {
      [1, 2, 3].forEach((hops) => {
        expect(world.blocksWithin([block.id], hops).sort()).toEqual(
          blocksWithin([block.id], hops).sort(),
        );
      });
    });
  });

  it("answers blocksWithin identically for multi-block sets", () => {
    requests.forEach((request) => {
      expect(world.blocksWithin(request.blockIds, 1).sort()).toEqual(
        blocksWithin(request.blockIds, 1).sort(),
      );
    });
  });

  it("answers blockDistance identically for every ordered pair of blocks", () => {
    trackBlocks.forEach((a) => {
      trackBlocks.forEach((b) => {
        expect(world.blockDistance([a.id], [b.id])).toBe(blockDistance([a.id], [b.id]));
      });
    });
  });

  it("agrees that the three corridors are unreachable from one another", () => {
    // Not an incidental property: it is why a crew moving between lines is
    // charged a flat road transfer instead of a rail path.
    const ns = trackBlocks.find((b) => b.line === "NS")!;
    const ew = trackBlocks.find((b) => b.line === "EW")!;
    expect(world.blockDistance([ns.id], [ew.id])).toBe(Number.POSITIVE_INFINITY);
    expect(world.blockDistance([ns.id], [ew.id])).toBe(blockDistance([ns.id], [ew.id]));
  });

  it("labels every request's sector identically", () => {
    requests.forEach((request) => {
      expect(world.sectorLabel(request.blockIds)).toBe(sectorLabel(request.blockIds));
      // And the label round-trips to what the dataset already carries.
      expect(world.sectorLabel(request.blockIds)).toBe(request.sector);
    });
  });

  it("returns the same compatibility verdict for every ordered class pair", () => {
    classes.forEach((a) => {
      classes.forEach((b) => {
        expect(world.areWorkClassesCompatible(a, b)).toEqual(areWorkClassesCompatible(a, b));
      });
    });
  });

  it("carries the window and travel constants the rules are written against", () => {
    const instance = buildInstanceFromLiterals();
    expect(world.windowStart).toBe(instance.window.startMinute);
    expect(world.windowEnd).toBe(instance.window.endMinute);
    expect(world.slotMinutes).toBe(instance.window.slotMinutes);
    expect(world.minutesPerBlockHop).toBe(instance.travel.minutesPerBlockHop);
    expect(world.interLineTransferMinutes).toBe(instance.travel.interLineTransferMinutes);
  });
});

describe("a world built from a different instance describes a different night", () => {
  it("sees the equipment count the instance gave it, not the literals'", () => {
    const instance = buildInstanceFromLiterals();
    const scarcer = buildWorld({
      ...instance,
      equipment: instance.equipment.map((item) =>
        item.id === "E-SIG" ? { ...item, units: 1 } : item,
      ),
    });
    expect(scarcer.equipmentById["E-SIG"].units).toBe(1);
    // The literal world is untouched: building a world must not mutate anything.
    expect(literalWorld().equipmentById["E-SIG"].units).toBe(2);
  });

  it("walks a topology it was given rather than the compiled-in one", () => {
    const instance = buildInstanceFromLiterals();
    const severed = buildWorld({
      ...instance,
      adjacency: instance.adjacency.filter(
        (edge) => edge.blockId !== "NS11-NS12" && edge.neighbourId !== "NS11-NS12",
      ),
    });
    expect(severed.blocksWithin(["NS11-NS12"], 1)).toEqual([]);
    expect(world.blocksWithin(["NS11-NS12"], 1).length).toBeGreaterThan(0);
  });
});
