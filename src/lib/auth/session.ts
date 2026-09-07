import type { Actor } from "@railplan/core/types/auth";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { TransactionSql } from "postgres";
import { connect, type Sql } from "@/lib/db/client";
import { createAuthClient } from "./server";
import { AuthError, requireAction, type PlannerAction } from "./permissions";

declare const verified: unique symbol;
/** Constructed only after a round trip to the Auth server; never from request JSON. */
export interface VerifiedIdentity { readonly id: string; readonly [verified]: true }
export async function verifyIdentity(): Promise<VerifiedIdentity> {
  const client = await createAuthClient();
  const { data, error } = await client.auth.getUser();
  if (isAuthRetryableFetchError(error) || (error?.status ?? 0) >= 500) throw new AuthError("auth_unavailable");
  if (error || !data.user || data.user.is_anonymous) throw new AuthError("unauthenticated");
  return { id: data.user.id } as VerifiedIdentity;
}

/** Every app query runs with authenticated privileges and only verified claims.
 * Transaction-local role/claims cannot leak across pooled requests. */
export async function withAuthenticatedTransaction<T>(
  identity: VerifiedIdentity,
  work: (tx: TransactionSql, actor: Actor) => Promise<T>,
  connection?: Sql | TransactionSql,
): Promise<T> {
  const sql = connection ?? connect();
  try {
    const run = async (tx: TransactionSql) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: identity.id, role: "authenticated" })}, true)`;
      const [profile] = await tx<{ id: string; role: Actor["role"]; contractor_organisation_id: string | null }[]>`
        select id, role, contractor_organisation_id from public.profiles where id = ${identity.id}`;
      if (!profile) throw new AuthError("forbidden");
      const actor: Actor = { id: profile.id, role: profile.role, contractorOrganisationId: profile.contractor_organisation_id };
      return work(tx, actor);
    };
    return "begin" in sql ? await sql.begin(run) as T : await run(sql);
  } finally { if (!connection && "end" in sql) await sql.end({ timeout: 1 }); }
}
export async function requireActor(action?: PlannerAction): Promise<{ identity: VerifiedIdentity; actor: Actor }> {
  const identity = await verifyIdentity();
  const actor = await withAuthenticatedTransaction(identity, async (_tx, actor) => {
    if (action) requireAction(actor, action);
    return actor;
  });
  return { identity, actor };
}
