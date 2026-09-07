// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";

import {
  buildInstanceFromLiterals,
  canonicalise,
  instanceDigest,
  assertInstancesMatch,
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
    expect(() => assertInstancesMatch(instance, tampered)).toThrow(/equipment/);
  });

  it("ignores canonical ordering when verifying a round trip", () => {
    expect(() => assertInstancesMatch(instance, {
      ...instance, requests: [...instance.requests].reverse(),
    })).not.toThrow();
  });

  it("compares values independently of database object property order", () => {
    const reordered = {
      ...instance,
      equipment: instance.equipment.map((item) => ({
        units: item.units, turnaroundMinutes: item.turnaroundMinutes,
        name: item.name, id: item.id,
      })),
    };
    expect(() => assertInstancesMatch(instance, reordered)).not.toThrow();
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
const reachable = await sql`select 1`.then(() => true, () => false);
afterAll(() => sql.end({ timeout: 1 }));
if (!reachable) console.warn("Database integration tests skipped: Postgres unavailable. Configure DATABASE_URL for the dedicated RailPlan database and apply migrations/seed; npm run db:verify is the required non-skipping gate.");

describe.skipIf(!reachable)(`round trip through ${DATABASE_URL.replace(/\/\/[^@]*@/, "//***@")}`, () => {
  it("protects every public planning table with row-level security", async () => {
    const tables = await sql`select tablename, rowsecurity from pg_tables where schemaname = 'public'`;
    expect(tables.length).toBeGreaterThanOrEqual(16);
    expect(tables.filter((table) => !table.rowsecurity)).toEqual([]);
  });

  it("rejects reversed lexical work-class pairs", async () => {
    await expect(sql.begin(async (tx) => {
      await tx`insert into work_class_incompatibility (class_a, class_b, reason, extends_to_adjacent)
        values ('traction-power', 'civil', 'invalid reverse pair probe', false)`;
      throw new Error("The database accepted a reversed pair");
    })).rejects.toMatchObject({ code: "23514" });
  });

  it("reads back exactly the night that was seeded", async () => {
    const loaded = await loadPlanningInstance(sql, instance.planningNight);
    assertInstancesMatch(instance, loaded);
  });

  it("reports which section differs rather than only that a digest moved", async () => {
    const loaded = await loadPlanningInstance(sql, instance.planningNight);
    // Compared section by section so a failure names the table to look at.
    (Object.keys(instance) as (keyof typeof instance)[]).forEach((key) => {
      expect({ [key]: loaded[key] }).toEqual({ [key]: instance[key] });
    });
  });

  it("detects real stored data drift and rolls the mutation back", async () => {
    const rollback = new Error("rollback drift probe");
    await expect(sql.begin(async (tx) => {
      await tx`update equipment_types set units = units + 1 where id = 'E-THM'`;
      const loaded = await loadPlanningInstance(tx, instance.planningNight);
      expect(() => assertInstancesMatch(instance, loaded)).toThrow(/equipment/);
      throw rollback;
    })).rejects.toBe(rollback);
    assertInstancesMatch(instance, await loadPlanningInstance(sql, instance.planningNight));
  });
});
