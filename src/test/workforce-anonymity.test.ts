// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type {
  WorkforceAvailability,
  WorkforceDemand,
  WorkforceRole,
} from "@railplan/core/types/workforce";

/**
 * Guards issue #21 acceptance criterion 2: no named-worker table, API, seed, UI
 * or log may be added before an accepted privacy decision.
 *
 * The production model is deliberately anonymous — counts of people per role,
 * per team, per interval. Named rostering would introduce identity, location,
 * absence and qualification data about real workers, which needs a documented
 * go/no-go from the data controller first. This test is the tripwire: it fails
 * if personal identifiers reach the workforce schema, so the expansion cannot
 * happen quietly through an unrelated migration.
 *
 * It is not a privacy control by itself. It catches the obvious shape of the
 * mistake, not a determined one, and it is deliberately scoped to the workforce
 * domain so it does not fight legitimate identity columns elsewhere — `profiles`
 * and `auth.users` hold account identity, which is a different lawful purpose.
 */

const PERSONAL_IDENTIFIER = [
  "first_name", "last_name", "full_name", "given_name", "family_name",
  "surname", "employee_id", "employee_number", "staff_id", "payroll",
  "national_id", "nric", "passport", "date_of_birth", "birth_date", "dob",
  "home_address", "personal_email", "personal_phone", "mobile_number",
  "next_of_kin", "emergency_contact", "leave_balance", "medical",
];

/** Tables whose rows describe workforce supply or demand. */
// `[^;]` already spans newlines, so the dotAll flag would add nothing and is
// not available at this TypeScript target.
const WORKFORCE_TABLE = /create table (?:public\.)?(\w*(?:workforce|roster|crew_member|worker)\w*)\s*\(([^;]*?)\)\s*;/gi;

function migrations(): { name: string; sql: string }[] {
  return readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({
      name,
      sql: readFileSync(`supabase/migrations/${name}`, "utf8"),
    }));
}

describe("workforce model stays anonymous until a privacy decision is accepted", () => {
  it("declares no personal identifiers in any workforce table", () => {
    const offences: string[] = [];
    for (const { name, sql } of migrations()) {
      for (const [, table, body] of sql.matchAll(WORKFORCE_TABLE)) {
        for (const term of PERSONAL_IDENTIFIER) {
          if (new RegExp(`\\b${term}\\b`, "i").test(body)) {
            offences.push(`${name}: ${table}.${term}`);
          }
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("finds the workforce tables it claims to be guarding", () => {
    // Without this, a rename would silently reduce the guard above to a no-op
    // that passes because it inspected nothing.
    const found = migrations().flatMap(({ sql }) =>
      [...sql.matchAll(WORKFORCE_TABLE)].map(([, table]) => table),
    );
    expect(found).toEqual(
      expect.arrayContaining([
        "workforce_roles",
        "workforce_availability",
        "request_workforce_demand",
      ]),
    );
  });

  it("keeps the core workforce types count-based", () => {
    // Compile-time proof that the shapes carry quantities, not people. Adding an
    // identity field to any of these stops this file typechecking.
    const role: WorkforceRole = { id: "technician", name: "Technician" };
    const availability: WorkforceAvailability = {
      planningNight: "2026-09-17",
      teamId: "T-TRK",
      roleId: "technician",
      startMinute: 0,
      endMinute: 240,
      count: 4,
    };
    const demand: WorkforceDemand = {
      requestId: "M-001",
      roleId: "technician",
      count: 2,
    };
    expect(Object.keys(role).sort()).toEqual(["id", "name"]);
    expect(Object.keys(availability)).toContain("count");
    expect(Object.keys(demand)).toContain("count");
    expect(JSON.stringify({ role, availability, demand })).not.toMatch(
      /name"\s*:\s*"(?!Technician)/,
    );
  });
});
