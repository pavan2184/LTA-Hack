import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

/**
 * The connection string.
 *
 * The owner requires no Docker. Set DATABASE_URL to a dedicated hosted or
 * native PostgreSQL development database. The inert loopback fallback avoids
 * another project's default Supabase port and never targets a hosted database.
 */
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

/**
 * A short-lived connection for a script or a request.
 *
 * `postgres.js` pools internally, so callers hold one of these for a unit of
 * work and end it — rather than sharing a module-level singleton that a
 * serverless function would keep alive across invocations it does not own.
 */
export function connect(url: string = DATABASE_URL) {
  const target = new URL(url);
  const supabase = target.hostname.endsWith(".supabase.co") || target.hostname.endsWith(".pooler.supabase.com");
  return postgres(url, {
    // The planning facts are small and read whole; a large pool buys nothing
    // and makes it easier to exhaust the database's connection limit.
    max: 4,
    // Fail fast rather than hanging a request behind an unreachable database.
    connect_timeout: 10,
    // Supavisor transaction mode cannot retain prepared statements between transactions.
    prepare: false,
    ...(supabase ? { ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(resolve(process.cwd(), "config/supabase-ca.crt"), "utf8"),
    } } : {}),
    connection: { statement_timeout: 10_000 },
    onnotice: () => {},
  });
}

export type Sql = ReturnType<typeof connect>;
