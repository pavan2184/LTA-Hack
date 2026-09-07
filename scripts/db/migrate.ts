/** Apply checked-in migrations to the configured database, without Docker. */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { connect } from "../../src/lib/db/client";
import { validateMigrationHistory, type MigrationVersion } from "./migration-history";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to the dedicated RailPlan development database.");
  const sql = connect();
  try {
    const files = (await readdir("supabase/migrations")).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
    const migrations = await Promise.all(files.map(async (name) => {
      const source = await readFile(`supabase/migrations/${name}`, "utf8");
      return { name, source, sha256: createHash("sha256").update(source).digest("hex") };
    }));
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(72419504)`;
      await tx`create schema if not exists railplan_private`;
      await tx`revoke all on schema railplan_private from public, anon`;
      await tx`create table if not exists railplan_private.migrations (
        name text primary key, sha256 text not null, applied_at timestamptz not null default now()
      )`;
      // Later migrations expose narrow private functions to authenticated users.
      // Preserve schema USAGE while keeping the migration ledger inaccessible.
      await tx`revoke all on railplan_private.migrations from public, anon, authenticated`;
      const history = await tx<MigrationVersion[]>`select name, sha256 from railplan_private.migrations`;
      validateMigrationHistory(migrations, history);
      const applied = new Set(history.map((migration) => migration.name));
      for (const { name, source, sha256 } of migrations) {
        if (applied.has(name)) {
          console.log(`Already applied: ${name}`);
          continue;
        }
        await tx.unsafe(source);
        await tx`insert into railplan_private.migrations (name, sha256) values (${name}, ${sha256})`;
        console.log(`Applied: ${name}`);
      }
    });
  } finally {
    await sql.end({ timeout: 1 });
  }
}
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  console.error(message.startsWith("Applied migration ") || message.startsWith("Set DATABASE_URL")
    ? message : "Migration failed and was rolled back. Check database access and migration SQL; no credentials or row data are printed.");
  process.exitCode = 1;
});
