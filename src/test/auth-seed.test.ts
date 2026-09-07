// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertLocalAuthSeedTarget } from "../../scripts/db/local-auth-target";
describe("local demo identity seed guard", () => {
  for (const url of ["postgres://u:p@db.project.supabase.co/postgres", "postgres://u:p@aws.pooler.supabase.com/postgres", "postgres://u:p@localhost.evil.test/postgres"]) {
    it(`refuses non-loopback ${new URL(url).hostname}`, () => {
      expect(() => assertLocalAuthSeedTarget(url, "development")).toThrow(/local/);
    });
  }
  it("rejects production even on loopback", () => {
    expect(() => assertLocalAuthSeedTarget("postgres://u:p@127.0.0.1/postgres", "production")).toThrow(/production/);
  });
  it("accepts an explicitly local development target", () => {
    expect(() => assertLocalAuthSeedTarget("postgres://u:p@127.0.0.1/postgres", "development")).not.toThrow();
  });
});
