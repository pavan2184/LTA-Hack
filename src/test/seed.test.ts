// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import type { Sql } from "@/lib/db/client";
import {
  seedDatabase,
  parseSeedArguments,
} from "../../scripts/db/seed-operation";

// The CLI is never imported. Only external database work is replaced: this
// double commits on callback return and rolls back on throw like postgres.js.
const control = vi.hoisted(() => ({
  corrupt: false,
  writerError: null as Error | null,
}));
vi.mock("../../scripts/db/seed-facts", () => ({
  writeSeedFacts: async (tx: MemoryTransaction, instance: unknown) => {
    tx.state.writes++;
    tx.state.revision++;
    tx.state.generation++;
    tx.state.facts = structuredClone(instance) as ReturnType<
      typeof buildInstanceFromLiterals
    >;
    if (control.corrupt)
      tx.state.facts.requests[0].title = "Wrong persisted value";
    if (control.writerError) throw control.writerError;
  },
}));
vi.mock("@/lib/db/instance", () => ({
  loadPlanningInstance: async (tx: MemoryTransaction) =>
    structuredClone(tx.state.facts),
}));
type MemoryState = {
  facts: ReturnType<typeof buildInstanceFromLiterals>;
  revision: number;
  generation: number;
  writes: number;
  existing: boolean;
};
type MemoryTransaction = { state: MemoryState };
function database(
  options: { existing?: boolean; loseRollback?: boolean } = {},
) {
  let committed: MemoryState = {
    facts: buildInstanceFromLiterals(),
    revision: 37,
    generation: 51,
    writes: 0,
    existing: options.existing ?? false,
  };
  committed.facts.requests[0].title = "Original state before rehearsal";
  const initial = structuredClone(committed);
  let commits = 0;
  const begin = async (...args: unknown[]) => {
    const work = args.at(-1) as (tx: unknown) => Promise<unknown>;
    const local = structuredClone(committed);
    const tx = Object.assign(
      (strings: TemplateStringsArray | string) => {
        if (typeof strings === "string") return strings;
        const query = strings.join("?");
        if (query.includes("has_state"))
          return Promise.resolve([{ has_state: local.existing }]);
        if (query.includes("lock_generation::text"))
          return Promise.resolve([
            {
              revision: String(local.revision),
              generation: String(local.generation),
            },
          ]);
        if (query.includes("as digest"))
          return Promise.resolve([{ digest: JSON.stringify(local.facts) }]);
        return Promise.resolve([]);
      },
      { state: local },
    );
    try {
      const value = await work(tx);
      committed = local;
      commits++;
      return value;
    } catch (error) {
      if (options.loseRollback) committed = local;
      throw error;
    }
  };
  return {
    sql: { begin } as unknown as Sql,
    initial,
    state: () => committed,
    commits: () => commits,
  };
}
beforeEach(() => {
  control.corrupt = false;
  control.writerError = null;
});

it("commits normal bootstrap only after persisted parity succeeds", async () => {
  const db = database();
  const result = await seedDatabase(db.sql, false);
  expect(result.verifiedOnly).toBe(false);
  expect(db.state().facts).toEqual(buildInstanceFromLiterals());
  expect(db.state().writes).toBe(1);
  expect(db.commits()).toBe(1);
});
it("rolls back normal seeding when persisted facts fail parity", async () => {
  const db = database();
  control.corrupt = true;
  await expect(seedDatabase(db.sql, false)).rejects.toThrow(
    /Planning instance/,
  );
  expect(db.state()).toEqual(db.initial);
  expect(db.commits()).toBe(0);
});
it("rehearses seeding but retains original facts, revision and generation", async () => {
  const db = database();
  expect((await seedDatabase(db.sql, true)).verifiedOnly).toBe(true);
  expect(db.state()).toEqual(db.initial);
});
it("does not mistake an identically worded writer failure for its private rollback sentinel", async () => {
  const db = database();
  const failure = new Error("Seed verification rollback");
  control.writerError = failure;
  await expect(seedDatabase(db.sql, true)).rejects.toBe(failure);
  expect(db.state()).toEqual(db.initial);
});
it("fails verification if the original state was not restored after rollback", async () => {
  const db = database({ loseRollback: true });
  await expect(seedDatabase(db.sql, true)).rejects.toThrow(
    /original database state/,
  );
});
it.each([false, true])(
  "refuses existing workflow records before seeding (verifyOnly=%s)",
  async (verifyOnly) => {
    const db = database({ existing: true });
    await expect(seedDatabase(db.sql, verifyOnly)).rejects.toThrow(
      /existing workflow/,
    );
    expect(db.state()).toEqual(db.initial);
    expect(db.commits()).toBe(0);
  },
);
it("accepts only the explicit rollback rehearsal flag, rejecting typoed flags before connecting", () => {
  expect(parseSeedArguments([])).toBe(false);
  expect(parseSeedArguments(["--verify-only"])).toBe(true);
  for (const args of [["--verify"], ["--force"], ["--verify-only", "extra"]])
    expect(() => parseSeedArguments(args)).toThrow(/Usage/);
});
