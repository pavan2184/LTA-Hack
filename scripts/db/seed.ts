/** Dedicated development bootstrap, or a transactionally rolled-back rehearsal.
 * Never run against a production/unrelated database. Existing workflow records
 * are refused; --verify-only must not commit any seeded content. */
import { connect } from "../../src/lib/db/client";
import {
  parseSeedArguments,
  seedDatabase,
  SeedSafetyError,
} from "./seed-operation";

async function main() {
  const verifyOnly = parseSeedArguments(process.argv.slice(2));
  if (!process.env.DATABASE_URL)
    throw new SeedSafetyError(
      "Set DATABASE_URL to the dedicated RailPlan development database.",
    );
  const sql = connect();
  try {
    const result = await seedDatabase(sql, verifyOnly);
    console.log(`literals digest ${result.expectedDigest}`);
    console.log(`database digest ${result.actualDigest}`);
    console.log(
      result.verifiedOnly
        ? "Seed rehearsal verified and rolled back. Original table digests, source revision and lock generation are unchanged."
        : "Seed committed after round-trip verification. The database and engine describe the same night.",
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof SeedSafetyError
      ? error.message
      : "Seed failed. No successful seed or rollback verification can be confirmed. Check database access, migrations and planning parity; no credentials or row data are printed.",
  );
  process.exitCode = 1;
});
