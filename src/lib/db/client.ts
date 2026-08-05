import postgres from "postgres";

/**
 * The connection string.
 *
 * Defaults to the local Supabase database so `supabase start` plus a seed is
 * the whole setup on a fresh clone. Nothing here reads a production URL by
 * accident: if `DATABASE_URL` is unset the target is unambiguously local.
 */
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * A short-lived connection for a script or a request.
 *
 * `postgres.js` pools internally, so callers hold one of these for a unit of
 * work and end it — rather than sharing a module-level singleton that a
 * serverless function would keep alive across invocations it does not own.
 */
export function connect(url: string = DATABASE_URL) {
  return postgres(url, {
    // The planning facts are small and read whole; a large pool buys nothing
    // and makes it easier to exhaust the database's connection limit.
    max: 4,
    // Fail fast rather than hanging a request behind an unreachable database.
    connect_timeout: 10,
    onnotice: () => {},
  });
}

export type Sql = ReturnType<typeof connect>;
