import type { TransactionSql } from "postgres";
import type { Sql } from "@/lib/db/client";
import type {
  RequestCatalogue,
  RequestSubmission,
  RequestFields,
  RequestRevision,
  RequestEvent,
  RequestStatus,
  RequestApproval,
} from "@railplan/core/types/requests";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import { requireAction } from "@/lib/auth/permissions";
import {
  createRequestSchema,
  updateRequestSchema,
  actionSchema,
  validateFields,
  type RequestAction,
} from "./schemas";
export class RequestError extends Error {
  constructor(
    public code:
      | "invalid_request"
      | "not_found"
      | "conflict"
      | "invalid_transition"
      | "forbidden",
    message: string,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}
type Connection = Sql | TransactionSql;
async function transaction<T>(
  identity: VerifiedIdentity,
  work: (tx: TransactionSql) => Promise<T>,
  connection?: Connection,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withAuthenticatedTransaction(
        identity,
        (tx) => work(tx),
        connection,
        "repeatable read",
      );
    } catch (error) {
      if (
        !connection &&
        attempt < 2 &&
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["40001", "40P01"].includes(String(error.code))
      )
        continue;
      throw error;
    }
  }
}
async function catalogue(tx: TransactionSql): Promise<RequestCatalogue> {
  const [row] = await tx<
    {
      catalogue: RequestCatalogue;
    }[]
  >`select railplan_private.request_catalogue() as catalogue`;
  return row.catalogue;
}
export async function getRequestCatalogue(
  identity: VerifiedIdentity,
  connection?: Connection,
) {
  return transaction(identity, catalogue, connection);
}
async function read(
  tx: TransactionSql,
  id: string,
  includeSource = true,
): Promise<RequestSubmission> {
  const [s] = await tx<
    {
      id: string;
      organisationId: string;
      organisationName: string;
      version: number;
      activeApprovedRevision: number | null;
      createdAt: Date;
      updatedAt: Date;
      scheduled: RequestSubmission["scheduled"];
    }[]
  >`
 select s.id,s.organisation_id as "organisationId",o.name as "organisationName",s.current_version as version,s.active_approved_version as "activeApprovedRevision",s.created_at as "createdAt",s.updated_at as "updatedAt",railplan_private.request_schedule(s.id) as scheduled
 from railplan_private.request_submissions s join public.contractor_organisations o on o.id=s.organisation_id where s.id=${id}`;
  if (!s) throw new RequestError("not_found", "This request does not exist.");
  const rows = await tx<
    {
      version: number;
      status: RequestStatus;
      fields: RequestFields;
      approval: RequestApproval | null;
      action: string;
      fromStatus: RequestStatus | null;
      actorId: string;
      reason: string;
      createdAt: Date;
    }[]
  >`
 select version,status,fields,approval,action,from_status as "fromStatus",actor_id as "actorId",reason,created_at as "createdAt" from railplan_private.request_revisions where submission_id=${id} order by version`;
  const sourceRows = includeSource
    ? await tx<
        { source: NonNullable<RequestSubmission["proposalSource"]> }[]
      >`select source from railplan_private.request_proposal_sources where submission_id=${id}`
    : [];
  const current = rows.find((r) => r.version === s.version)!;
  const revisions: RequestRevision[] = rows.map((r) => ({
    version: r.version,
    status: r.status,
    fields: r.fields,
    approval: r.approval,
    createdAt: r.createdAt.toISOString(),
  }));
  const history: RequestEvent[] = rows.map((r) => ({
    version: r.version,
    action: r.action,
    fromStatus: r.fromStatus,
    toStatus: r.status,
    actorId: r.actorId,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
  return {
    ...s,
    ...(includeSource ? { proposalSource: sourceRows[0]?.source ?? null } : {}),
    status: current.status,
    fields: current.fields,
    approval: current.approval,
    revisions,
    history,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
export async function getRequest(
  identity: VerifiedIdentity,
  id: string,
  connection?: Connection,
) {
  return transaction(identity, (tx) => read(tx, id), connection);
}
export async function listRequests(
  identity: VerifiedIdentity,
  connection?: Connection,
) {
  return transaction(
    identity,
    async (tx) => {
      const rows = await tx<
        {
          id: string;
        }[]
      >`select id from railplan_private.request_submissions order by updated_at desc,id desc limit 100`;
      const result: RequestSubmission[] = [];
      for (const row of rows) result.push(await read(tx, row.id, false));
      return result;
    },
    connection,
  );
}
async function mutate(
  tx: TransactionSql,
  id: string | null,
  version: number | null,
  operation: string,
  fields: RequestFields | null,
  approval: RequestApproval | null,
  reason: string,
) {
  if (fields) {
    const errors = validateFields(fields, await catalogue(tx), false);
    if (Object.keys(errors).length)
      throw new RequestError(
        "invalid_request",
        "Correct the highlighted request fields.",
        errors,
      );
  }
  const [row] = await tx<
    {
      result: {
        id?: string;
        code?: RequestError["code"];
        fieldErrors?: Record<string, string>;
      };
    }[]
  >`select railplan_private.mutate_request(${id}::uuid,${version}::integer,${operation},${tx.json(fields as never)},${tx.json(approval as never)},${reason}) as result`;
  if (row.result.code)
    throw new RequestError(
      row.result.code,
      row.result.code === "conflict"
        ? "This request changed. Reload before editing."
        : row.result.code === "not_found"
          ? "This request does not exist."
          : row.result.code === "invalid_transition"
            ? "This action is not available in the current status."
            : row.result.code === "forbidden"
              ? "You cannot perform this action."
              : "Correct the highlighted request fields.",
      row.result.fieldErrors,
    );
  return read(tx, row.result.id!);
}
export async function createRequest(
  identity: VerifiedIdentity,
  raw: {
    fields: RequestFields;
  },
  connection?: Connection,
) {
  const input = createRequestSchema.parse(raw);
  return transaction(
    identity,
    (tx) => mutate(tx, null, null, "create", input.fields, null, ""),
    connection,
  );
}
export async function updateRequest(
  identity: VerifiedIdentity,
  id: string,
  raw: {
    expectedVersion: number;
    fields: RequestFields;
  },
  connection?: Connection,
) {
  const input = updateRequestSchema.parse(raw);
  return transaction(
    identity,
    (tx) =>
      mutate(tx, id, input.expectedVersion, "edit", input.fields, null, ""),
    connection,
  );
}
export async function actOnRequest(
  identity: VerifiedIdentity,
  id: string,
  raw: RequestAction,
  connection?: Connection,
) {
  const input = actionSchema.parse(raw);
  return transaction(
    identity,
    async (tx) => {
      // SQL rechecks the same action against the live profile. The app's explicit
      // guard also keeps future call sites on the shared authorization vocabulary.
      if (["approve", "needs_info", "reject"].includes(input.action))
        await withAuthenticatedTransaction(
          identity,
          async (_db, actor) => requireAction(actor, "approve"),
          tx,
        );
      return mutate(
        tx,
        id,
        input.expectedVersion,
        input.action,
        null,
        input.approval ?? null,
        input.reason,
      );
    },
    connection,
  );
}
