/** A required database gate: unavailable, unseeded, or drifting databases fail. */
import { buildInstanceFromLiterals, assertInstancesMatch, instanceDigest } from "@railplan/core/domain/instance";
import { connect } from "../../src/lib/db/client";
import { loadPlanningInstance } from "../../src/lib/db/instance";

async function main() {
  const sql = connect();
  try {
    const expected = buildInstanceFromLiterals();
    const actual = await loadPlanningInstance(sql, expected.planningNight);
    assertInstancesMatch(expected, actual);
    console.log(`Database round trip verified: ${instanceDigest(actual)} (${actual.requests.length} requests)`);
  } finally {
    await sql.end({ timeout: 1 });
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error && error.message.startsWith("Planning instance")
    ? error.message : "Database verification failed. Check DATABASE_URL and apply migrations/seed to the dedicated RailPlan database. No checks were skipped.");
  process.exitCode = 1;
});
