import type { TransactionSql } from "postgres";
import {
  assertInstancesMatch,
  buildInstanceFromLiterals,
  instanceDigest,
} from "@railplan/core/domain/instance";
import type { Sql } from "../../src/lib/db/client";
import { loadPlanningInstance } from "../../src/lib/db/instance";
import { writeSeedFacts } from "./seed-facts";

const factTables = [
  "stations",
  "track_blocks",
  "block_adjacency",
  "conflict_zones",
  "conflict_zone_blocks",
  "conflict_zone_work_classes",
  "teams",
  "team_skills",
  "equipment_types",
  "work_class_incompatibility",
  "planning_nights",
  "maintenance_requests",
  "request_blocks",
  "request_required_skills",
  "request_equipment",
  "request_dependencies",
  "workforce_roles",
  "workforce_availability",
  "request_workforce_demand",
].sort();
// Child histories have foreign keys to these roots. Do not reset a database
// that has started a workflow, even when no approved intake is currently active.
const workflowTables = [
  "planning_runs",
  "request_submissions",
  "private_drafts",
  "notification_configurations",
  "notification_configuration_events",
  "notification_deliveries",
].sort();
export class SeedSafetyError extends Error {}
interface SeedState {
  source: { revision: string; generation: string };
  tables: { name: string; digest: string }[];
}
async function readSeedState(tx: TransactionSql): Promise<SeedState> {
  const [source] = await tx<SeedState["source"][]>`
    select revision::text, lock_generation::text as generation
    from railplan_private.planning_source where singleton`;
  if (!source)
    throw new SeedSafetyError("Seed requires the complete planning schema.");
  const tables: SeedState["tables"] = [];
  for (const name of factTables) {
    // Hash every seeded row, including other nights, without returning raw
    // facts to the CLI. MD5 is a state-change check, not an authenticity claim.
    const [{ digest }] = await tx<{ digest: string }[]>`
      select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]'::jsonb)::text) as digest
      from ${tx(`public.${name}`)} r`;
    tables.push({ name, digest });
  }
  return { source, tables };
}
export function parseSeedArguments(args: string[]): boolean {
  if (!args.length) return false;
  if (args.length === 1 && args[0] === "--verify-only") return true;
  throw new SeedSafetyError("Usage: npm run db:seed -- [--verify-only]");
}
export async function seedDatabase(sql: Sql, verifyOnly: boolean) {
  const instance = buildInstanceFromLiterals();
  const expectedDigest = instanceDigest(instance);
  const rollback = new Error("Seed verification rollback");
  let before: SeedState | undefined;
  let actualDigest: string | undefined;
  try {
    await sql.begin(async (tx) => {
      await tx`set local lock_timeout = '5s'`;
      // Same first lock as application fact/publication mutations. It neither
      // changes the source revision nor resets its generation.
      await tx`select singleton from railplan_private.planning_source where singleton for update`;
      for (const table of workflowTables)
        await tx`lock table ${tx(`railplan_private.${table}`)} in share row exclusive mode`;
      for (const table of workflowTables) {
        const [{ has_state }] = await tx<{ has_state: boolean }[]>`
          select exists(select 1 from ${tx(`railplan_private.${table}`)}) as has_state`;
        if (has_state)
          throw new SeedSafetyError(
            "Seed refused: existing workflow records must be preserved. Use a dedicated empty development database.",
          );
      }
      for (const table of factTables)
        await tx`lock table ${tx(`public.${table}`)} in access exclusive mode`;
      if (verifyOnly) before = await readSeedState(tx);
      await writeSeedFacts(tx, instance);
      const loaded = await loadPlanningInstance(tx, instance.planningNight);
      assertInstancesMatch(instance, loaded);
      actualDigest = instanceDigest(loaded);
      // Identity, never message text, distinguishes successful rehearsal from
      // a database/loader/writer exception. No verify-only path reaches COMMIT.
      if (verifyOnly) throw rollback;
    });
  } catch (error) {
    if (!verifyOnly || error !== rollback) throw error;
  }
  if (verifyOnly) {
    const after = await sql.begin(
      "isolation level repeatable read read only",
      readSeedState,
    );
    if (!before || JSON.stringify(before) !== JSON.stringify(after))
      throw new SeedSafetyError(
        "Seed verification could not confirm the original database state was restored. Check for concurrent activity.",
      );
  }
  if (!actualDigest) throw new SeedSafetyError("Seed parity was not verified.");
  return { verifiedOnly: verifyOnly, expectedDigest, actualDigest };
}
