import { randomBytes, randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, type Sql } from "../../src/lib/db/client";

export interface FixtureUser {
  id: string;
  role: "planner" | "contractor";
  org: string | null;
  email: string;
  password: string;
}
const history = [
  ...[
    "planning_runs",
    "plan_placements",
    "plan_deferrals",
    "planner_decisions",
    "plan_publications",
    "plan_audit_events",
  ].map((table) => [table, "immutable_history"]),
  ["request_revisions", "immutable_request_history"],
  ["private_draft_revisions", "immutable_private_draft_history"],
  ["request_proposal_sources", "immutable_request_proposal_source"],
  ...[
    "notification_configuration_events",
    "notification_deliveries",
    "notification_attempts",
    "notification_results",
  ].map((table) => [table, "immutable_notification_history"]),
];
export interface E2EFixture {
  sql: Sql;
  orgs: string[];
  users: FixtureUser[];
  night: string;
  recoveryPath: string;
}
export async function createFixture(): Promise<E2EFixture> {
  let target: URL;
  try {
    target = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    throw new Error(
      "E2E requires the explicitly assigned RailPlan test database",
    );
  }
  const assignedDatabase =
    target.hostname === "db.ufcdynfjfzbjvglsdaqp.supabase.co" ||
    (target.hostname.endsWith(".pooler.supabase.com") &&
      target.username === "postgres.ufcdynfjfzbjvglsdaqp");
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL !==
      "https://ufcdynfjfzbjvglsdaqp.supabase.co" ||
    !assignedDatabase
  )
    throw new Error(
      "E2E requires the explicitly assigned RailPlan test project",
    );
  const sql = connect();
  const orgs = [randomUUID(), randomUUID()];
  const users: FixtureUser[] = ["planner", "contractor", "contractor"].map(
    (role, index) => ({
      id: randomUUID(),
      role: role as FixtureUser["role"],
      org: index ? orgs[index - 1] : null,
      email: `railplan-e2e-${randomUUID()}@example.invalid`,
      password: randomBytes(24).toString("base64url"),
    }),
  );
  const recoveryPath = join(
    tmpdir(),
    `railplan-e2e-recovery-${randomUUID()}.json`,
  );
  let recoveryWritten = false;
  try {
    const [{ planning_night: night }] =
      await sql`select planning_night::text from public.planning_nights order by planning_night limit 1`;
    const [guard] = await sql`select
      (select count(*)::int from railplan_private.plan_publications p join railplan_private.planning_runs r on r.id=p.plan_id where r.planning_night=${night}::date) publications,
      (select count(*)::int from railplan_private.request_submissions where active_approved_version is not null) approved`;
    if (guard.publications || guard.approved)
      throw new Error(
        "E2E refuses a night with existing publication or approved user intake",
      );
    // An interrupted process can be cleaned from these exact IDs. Passwords,
    // sessions, transcript text and provider keys never enter this manifest.
    await writeFile(
      recoveryPath,
      JSON.stringify({ orgs, userIds: users.map((user) => user.id) }),
      { mode: 0o600, flag: "wx" },
    );
    recoveryWritten = true;
    await sql.begin(async (tx) => {
      for (let i = 0; i < orgs.length; i++)
        await tx`insert into public.contractor_organisations(id,name) values(${orgs[i]},${`E2E isolated organisation ${i + 1}`})`;
      for (const user of users) {
        await tx`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
          values('00000000-0000-0000-0000-000000000000',${user.id},'authenticated','authenticated',${user.email},extensions.crypt(${user.password},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')`;
        await tx`insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at)
          values(${randomUUID()},${user.id},${user.id},${tx.json({ sub: user.id, email: user.email, email_verified: true })},'email',now(),now())`;
        await tx`insert into public.profiles(id,role,contractor_organisation_id) values(${user.id},${user.role},${user.org})`;
      }
    });
    return { sql, orgs, users, night: String(night), recoveryPath };
  } catch (error) {
    let cleanupFailed = false;
    if (recoveryWritten) {
      try {
        await cleanupFixture({ sql, orgs, users, night: "", recoveryPath });
      } catch {
        cleanupFailed = true;
      }
    } else await sql.end({ timeout: 1 });
    // Postgres errors can retain bound fixture passwords. Never expose them to
    // Vitest's rich error formatter, even when provisioning fails.
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      /^[A-Z0-9]{5}$/.test(String(error.code))
        ? String(error.code)
        : "preflight";
    throw new Error(
      `E2E fixture provisioning failed (${code}); no credentials are logged.${cleanupFailed ? ` Exact recovery IDs retained at ${recoveryPath}.` : ""}`,
    );
  }
}
export async function cleanupFixture(fixture: E2EFixture) {
  const { sql, orgs, users } = fixture,
    ids = users.map((user) => user.id);
  try {
    await sql.begin(async (tx) => {
      await tx`update railplan_private.planning_source set lock_generation=lock_generation+1 where singleton`;
      await tx.unsafe(
        `lock table ${[...history.map(([table]) => table), "request_submissions", "private_drafts", "notification_configurations"].map((table) => `railplan_private.${table}`).join(",")} in access exclusive mode`,
      );
      const runs =
        await tx`select id from railplan_private.planning_runs where created_by = any(${ids}::uuid[])`;
      const runIds = runs.map((row) => row.id);
      const submissions =
        await tx`select id from railplan_private.request_submissions where organisation_id = any(${orgs}::uuid[])`;
      for (const [table, trigger] of history)
        await tx.unsafe(
          `alter table railplan_private.${table} disable trigger ${trigger}`,
        );
      // Everything selected here belongs to exact newly provisioned IDs. No reset/seed or broad delete.
      await tx`delete from railplan_private.notification_results where attempt_id in(select a.id from railplan_private.notification_attempts a join railplan_private.notification_deliveries d on d.id=a.delivery_id where d.organisation_id = any(${orgs}::uuid[]))`;
      await tx`delete from railplan_private.notification_attempts where delivery_id in(select id from railplan_private.notification_deliveries where organisation_id = any(${orgs}::uuid[]))`;
      await tx`delete from railplan_private.notification_deliveries where organisation_id = any(${orgs}::uuid[])`;
      await tx`delete from railplan_private.notification_configuration_events where organisation_id = any(${orgs}::uuid[])`;
      await tx`delete from railplan_private.notification_configurations where organisation_id = any(${orgs}::uuid[])`;
      if (runIds.length) {
        for (const table of [
          "plan_audit_events",
          "planner_decisions",
          "plan_deferrals",
          "plan_placements",
          "plan_publications",
        ])
          await tx.unsafe(
            `delete from railplan_private.${table} where plan_id = any($1::uuid[])`,
            [runIds],
          );
        await tx`delete from railplan_private.planning_runs where id = any(${runIds}::uuid[])`;
      }
      await tx`delete from railplan_private.request_proposal_sources where draft_id in(select id from railplan_private.private_drafts where owner_id = any(${ids}::uuid[]))`;
      await tx`delete from railplan_private.private_draft_revisions where draft_id in(select id from railplan_private.private_drafts where owner_id = any(${ids}::uuid[]))`;
      await tx`delete from railplan_private.private_drafts where owner_id = any(${ids}::uuid[])`;
      await tx`delete from railplan_private.request_revisions where submission_id in(select id from railplan_private.request_submissions where organisation_id = any(${orgs}::uuid[]))`;
      await tx`delete from railplan_private.request_submissions where organisation_id = any(${orgs}::uuid[])`;
      await tx`set constraints all immediate`;
      for (const [table, trigger] of history)
        await tx.unsafe(
          `alter table railplan_private.${table} enable trigger ${trigger}`,
        );
      if (runs.length || submissions.length)
        await tx`update railplan_private.planning_source set revision=revision+1 where singleton`;
      await tx`delete from auth.users where id = any(${ids}::uuid[])`;
      await tx`delete from public.contractor_organisations where id = any(${orgs}::uuid[])`;
    });
    await assertCleanup(sql, ids, orgs);
    await unlink(fixture.recoveryPath);
  } finally {
    await sql.end({ timeout: 1 });
  }
}
async function assertCleanup(sql: Sql, ids: string[], orgs: string[]) {
  const [remaining] =
    await sql`select (select count(*)::int from auth.users where id = any(${ids}::uuid[])) users,
    (select count(*)::int from public.contractor_organisations where id = any(${orgs}::uuid[])) organisations`;
  const guards =
    await sql`select tgname,tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='railplan_private' and tgname in('immutable_history','immutable_request_history','immutable_private_draft_history','immutable_request_proposal_source','immutable_notification_history')`;
  if (
    remaining.users ||
    remaining.organisations ||
    guards.length !== 13 ||
    guards.some((row) => row.tgenabled !== "O")
  )
    throw new Error("E2E exact fixture cleanup verification failed");
}
