/** Trusted operator only. No account creation, password handling or invitations. */
import { connect } from "../../src/lib/db/client";
const [userId, role, organisationId] = process.argv.slice(2);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!uuid.test(userId ?? "") || !["planner", "contractor"].includes(role ?? "") ||
    (role === "contractor" ? !uuid.test(organisationId ?? "") : Boolean(organisationId))) {
  console.error("Usage: npm run db:provision-user -- USER_UUID planner | USER_UUID contractor ORGANISATION_UUID");
  process.exit(1);
}
async function main() {
const sql = connect();
try {
  await sql.begin(async tx => {
    const [user] = await tx`select id from auth.users where id = ${userId} and email_confirmed_at is not null`;
    if (!user) throw new Error("Account must exist with a confirmed email before provisioning.");
    await tx`insert into public.profiles(id, role, contractor_organisation_id)
      values (${userId}, ${role}, ${organisationId ?? null})
      on conflict (id) do update set role = excluded.role, contractor_organisation_id = excluded.contractor_organisation_id`;
  });
  console.log("Role provisioned for the supplied confirmed account.");
} catch {
  console.error("Provisioning failed. Verify the confirmed user ID, organisation ID and database configuration.");
  process.exitCode = 1;
} finally { await sql.end({ timeout: 1 }); }

}
void main();
