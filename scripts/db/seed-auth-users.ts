import { randomBytes, randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { connect, DATABASE_URL } from "../../src/lib/db/client";
import { assertLocalAuthSeedTarget } from "./local-auth-target";

// Explicit localhost-only demonstration seeding; never fall back to hosted auth.
try { assertLocalAuthSeedTarget(DATABASE_URL, process.env.NODE_ENV); }
catch { console.error("Refusing demo identities: use a local loopback database outside production."); process.exit(1); }
const output = ".railplan-local-demo.json";
const accounts = ["planner", "contractor"].map(role => ({
  id: randomUUID(), role, email: `${role}.demo@railplan.local`, password: randomBytes(24).toString("base64url"),
}));
async function main() {
const sql = connect();
let credentialsWritten = false;
try {
  // Exclusive create prevents overwriting someone's existing credentials.
  await writeFile(output, JSON.stringify(accounts, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  credentialsWritten = true;
  await sql.begin(async tx => {
    const org = randomUUID();
    await tx`insert into contractor_organisations(id,name) values (${org},'Local demo contractor')`;
    for (const account of accounts) {
      if ((await tx`select id from auth.users where email = ${account.email}`).length) throw new Error("Demo account already exists");
      await tx`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
        values ('00000000-0000-0000-0000-000000000000',${account.id},'authenticated','authenticated',${account.email},extensions.crypt(${account.password},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')`;
      await tx`insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at)
        values (${randomUUID()},${account.id},${account.id},${tx.json({ sub: account.id, email: account.email, email_verified: true })},'email',now(),now())`;
      await tx`insert into profiles(id,role,contractor_organisation_id) values (${account.id},${account.role},${account.role === "contractor" ? org : null})`;
    }
  });
  console.log("Local demo identities created. Credentials are in the ignored owner-readable .railplan-local-demo.json file.");
} catch {
  if (credentialsWritten) await unlink(output).catch(() => {});
  console.error("Local demo seed failed; no accounts were committed. Check local auth migrations and existing demo identities.");
  process.exitCode = 1;
} finally { await sql.end({ timeout: 1 }); }

}
void main();
