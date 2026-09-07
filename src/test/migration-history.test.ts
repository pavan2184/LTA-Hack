// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateMigrationHistory } from "../../scripts/db/migration-history";

describe("migration history consistency", () => {
  const applied = [{ name: "20260803000000_planning_facts.sql", sha256: "original" }];
  it("rejects deleting a migration that the database already applied", () => {
    expect(() => validateMigrationHistory([], applied)).toThrow(/missing.*20260803000000_planning_facts/i);
  });
  it("rejects edits to an applied migration", () => {
    expect(() => validateMigrationHistory([{ ...applied[0], sha256: "edited" }], applied)).toThrow(/changed/);
  });
  it("allows unchanged history followed by new migrations", () => {
    expect(() => validateMigrationHistory([...applied, { name: "20260907045418_next.sql", sha256: "next" }], applied)).not.toThrow();
  });
});
