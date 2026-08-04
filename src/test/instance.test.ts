// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildInstanceFromLiterals,
  canonicalise,
  instanceDigest,
} from "@railplan/core/domain/instance";
import { blockAdjacency, trackBlocks } from "@railplan/core/domain/network";
import { requests } from "@railplan/core/data/requests";

import { connect, DATABASE_URL } from "@/lib/db/client";
import { loadPlanningInstance } from "@/lib/db/instance";

const instance = buildInstanceFromLiterals();

describe("the planning instance", () => {
  it("is stable under reordering, so a digest compares content and not layout", () => {
    const shuffled = canonicalise({
      ...instance,
      requests: [...instance.requests].reverse(),
      teams: [...instance.teams].reverse(),
      blocks: [...instance.blocks].reverse(),
      adjacency: [...instance.adjacency].reverse(),
    });
    expect(instanceDigest(shuffled)).toBe(instanceDigest(instance));
  });

  it("treats an incompatible pair as unordered", () => {
    const flipped = canonicalise({
      ...instance,
      workClassIncompatibilities: instance.workClassIncompatibilities.map((pair) => ({
        ...pair,
        a: pair.b,
        b: pair.a,
      })),
    });
    expect(instanceDigest(flipped)).toBe(instanceDigest(instance));
  });

  it("notices a changed figure", () => {
    const tampered = {
      ...instance,
      equipment: instance.equipment.map((item) =>
        item.id === "E-THM" ? { ...item, units: item.units + 1 } : item,
      ),
    };
    // One more thermal imaging unit is exactly the kind of change that stops
    // M-004 and M-011 conflicting, so it had better not hash the same.
    expect(instanceDigest(tampered)).not.toBe(instanceDigest(instance));
  });

  it("carries the whole night", () => {
    expect(instance.requests).toHaveLength(requests.length);
    expect(instance.blocks).toHaveLength(trackBlocks.length);
    expect(instance.stations.length).toBeGreaterThan(0);
    expect(instance.teams.length).toBeGreaterThan(0);
  });

  it("stores every adjacency edge in both directions", () => {
    const edges = new Set(instance.adjacency.map((e) => `${e.blockId}|${e.neighbourId}`));
    instance.adjacency.forEach((edge) => {
      expect(edges.has(`${edge.neighbourId}|${edge.blockId}`)).toBe(true);
    });
  });

  it("stores exactly the adjacency the topology derives", () => {
    // The stored edges exist so a solver in another language need not
    // reimplement the derivation. This is the test that keeps the two honest.
    const derived = new Set(
      Object.entries(blockAdjacency).flatMap(([blockId, neighbours]) =>
        neighbours.map((neighbourId) => `${blockId}|${neighbourId}`),
      ),
    );
    const stored = new Set(instance.adjacency.map((e) => `${e.blockId}|${e.neighbourId}`));
    expect(stored).toEqual(derived);
  });

  it("expands every request onto atomic blocks, never a sector label", () => {
    const known = new Set(trackBlocks.map((block) => block.id));
    instance.requests.forEach((request) => {
      expect(request.blockIds.length).toBeGreaterThan(0);
      request.blockIds.forEach((id) => expect(known.has(id)).toBe(true));
    });
  });
});

/**
 * The round trip.
 *
 * Skipped when no database is reachable, so a clone without Docker still runs a
 * full suite. `npm run db:seed` performs the same check and fails loudly, which
 * is the gate that actually matters — this one is here so a regression in the
 * loader is caught by `npm test` on a machine that does have the database up.
 */
const sql = connect();
const reachable = await Promise.race([
  sql`select 1`.then(
    () => true,
    () => false,
  ),
  // A refused connection rejects immediately, but a half-open port or a
  // container still starting will not. The suite must not hang on either.
  new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000)),
]);

describe.skipIf(!reachable)(`round trip through ${DATABASE_URL.replace(/\/\/[^@]*@/, "//***@")}`, () => {
  it("reads back exactly the night that was seeded", async () => {
    const loaded = await loadPlanningInstance(sql, instance.planningNight);
    expect(instanceDigest(loaded)).toBe(instanceDigest(instance));
  });

  it("reports which section differs rather than only that a digest moved", async () => {
    const loaded = await loadPlanningInstance(sql, instance.planningNight);
    // Compared section by section so a failure names the table to look at.
    (Object.keys(instance) as (keyof typeof instance)[]).forEach((key) => {
      expect({ [key]: loaded[key] }).toEqual({ [key]: instance[key] });
    });
  });
});

if (!reachable) await sql.end();
