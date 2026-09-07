import type { TransactionSql } from "postgres";
import type {
  PrivateDraft,
  DraftProposal,
  PrivateDraftDetail,
  PrivateDraftRevision,
} from "@railplan/core/types/ingestions";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import type { Sql } from "@/lib/db/client";
import {
  getRequestCatalogue,
  getRequest,
  RequestError,
} from "@/lib/requests/service";
import {
  editPrivateDraftSchema,
  submitPrivateDraftSchema,
  privateDraftValidationErrors,
  type EditPrivateDraftInput,
  type SubmitPrivateDraftInput,
} from "./review-schemas";
import { savedBatchSchema } from "./schemas";
import { validateExtraction } from "./guard";
import { callExtractionModel } from "./model";
import { IngestionError } from "./errors";
type Connection = Sql | TransactionSql;
async function read(
  tx: TransactionSql,
  ids?: string[],
): Promise<PrivateDraft[]> {
  const rows = await tx<
    (Omit<PrivateDraft, "createdAt" | "updatedAt"> & {
      createdAt: Date;
      updatedAt: Date;
    })[]
  >`
 select d.id,d.owner_id as "ownerId",d.organisation_id as "organisationId",d.current_version as version,d.status,d.submitted_request_id as "submittedRequestId",coalesce(r.manual_fields,'[]'::jsonb) as "manualFields",
 r.fields,r.confidence,r.missing_fields as "missingFields",r.evidence,r.model,r.extractor_version as "extractorVersion",
 d.created_at as "createdAt",d.updated_at as "updatedAt"
 from railplan_private.private_drafts d join railplan_private.private_draft_revisions r on r.draft_id=d.id and r.version=d.current_version
 ${ids ? tx`where d.id in ${tx(ids)}` : tx``} order by d.created_at desc,d.id desc limit 100`;
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}
export async function listPrivateDrafts(
  identity: VerifiedIdentity,
  connection?: Connection,
) {
  return withAuthenticatedTransaction(identity, (tx) => read(tx), connection);
}
export async function savePrivateDrafts(
  identity: VerifiedIdentity,
  proposals: DraftProposal[],
  connection?: Connection,
) {
  const parsed = savedBatchSchema.safeParse(proposals);
  if (!parsed.success) throw new IngestionError("invalid_model_output");
  return withAuthenticatedTransaction(
    identity,
    async (tx) => {
      const [result] = await tx<
        { ids: string[] }[]
      >`select railplan_private.save_private_drafts(${tx.json(parsed.data as never)}) as ids`;
      return read(tx, result.ids);
    },
    connection,
  );
}
export async function consumeIngestionToken(
  identity: VerifiedIdentity,
  connection?: Connection,
) {
  return withAuthenticatedTransaction(
    identity,
    async (tx) => {
      const [r] = await tx<
        { allowed: boolean; retry_after_seconds: number }[]
      >`select * from railplan_private.consume_ingestion_token()`;
      if (!r.allowed)
        throw new IngestionError("rate_limited", r.retry_after_seconds);
    },
    connection,
  );
}
export async function extractAndSaveDrafts(
  identity: VerifiedIdentity,
  transcript: string,
): Promise<PrivateDraft[]> {
  if (!process.env.ANTHROPIC_API_KEY)
    throw new IngestionError("model_unavailable");
  await consumeIngestionToken(identity);
  const catalogue = await getRequestCatalogue(identity);
  const raw = await callExtractionModel(transcript, catalogue);
  const proposals = validateExtraction(raw, transcript, catalogue);
  return savePrivateDrafts(identity, proposals);
}

async function reviewTransaction<T>(
  identity: VerifiedIdentity,
  work: (tx: TransactionSql) => Promise<T>,
  connection?: Connection,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withAuthenticatedTransaction(
        identity,
        work,
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
async function detail(
  identity: VerifiedIdentity,
  tx: TransactionSql,
  id: string,
): Promise<PrivateDraftDetail> {
  const [draft] = await read(tx, [id]);
  if (!draft)
    throw new RequestError("not_found", "This private draft does not exist.");
  const rows = await tx<
    (Omit<PrivateDraftRevision, "createdAt"> & { createdAt: Date })[]
  >`
 select r.version,r.fields,r.confidence,r.missing_fields as "missingFields",r.evidence,coalesce(r.manual_fields,'[]'::jsonb) as "manualFields",
 coalesce(r.action,'extract') as action,coalesce(r.actor_id,d.owner_id) as "actorId",r.from_status as "fromStatus",coalesce(r.status,'private') as status,coalesce(r.reason,'') as reason,r.created_at as "createdAt",r.model,r.extractor_version as "extractorVersion"
 from railplan_private.private_draft_revisions r join railplan_private.private_drafts d on d.id=r.draft_id where r.draft_id=${id} order by r.version`;
  return {
    ...draft,
    revisions: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    validationErrors: privateDraftValidationErrors(
      draft.fields,
      await getRequestCatalogue(identity, tx),
    ),
  };
}
export async function getPrivateDraft(
  identity: VerifiedIdentity,
  id: string,
  connection?: Connection,
) {
  return reviewTransaction(
    identity,
    (tx) => detail(identity, tx, id),
    connection,
  );
}
async function mutateReviewedDraft(
  identity: VerifiedIdentity,
  tx: TransactionSql,
  id: string,
  version: number,
  action: "edit" | "submit",
  fields: EditPrivateDraftInput["fields"] | null,
  reason: string,
  organisationId?: string,
) {
  const [row] = await tx<
    {
      result: {
        id?: string;
        version?: number;
        requestId?: string;
        code?: RequestError["code"];
        fieldErrors?: Record<string, string>;
      };
    }[]
  >`select railplan_private.review_private_draft(${id}::uuid,${version}::integer,${action},${tx.json(fields as never)},${reason},${organisationId ?? null}::uuid) as result`;
  if (row.result.code)
    throw new RequestError(
      row.result.code,
      row.result.code === "not_found"
        ? "This private draft does not exist."
        : row.result.code === "conflict"
          ? "This draft changed. Reload before continuing."
          : row.result.code === "invalid_transition"
            ? "This draft was already submitted."
            : row.result.code === "forbidden"
              ? "You cannot share this draft with the selected organisation."
              : "Correct the highlighted draft fields.",
      row.result.fieldErrors,
    );
  const draft = await detail(identity, tx, id);
  return { draft, requestId: row.result.requestId };
}
export async function updatePrivateDraft(
  identity: VerifiedIdentity,
  id: string,
  raw: EditPrivateDraftInput,
  connection?: Connection,
): Promise<PrivateDraftDetail> {
  const input = editPrivateDraftSchema.parse(raw);
  return reviewTransaction(
    identity,
    async (tx) =>
      (
        await mutateReviewedDraft(
          identity,
          tx,
          id,
          input.expectedVersion,
          "edit",
          input.fields,
          input.reason,
        )
      ).draft,
    connection,
  );
}
export async function submitPrivateDraft(
  identity: VerifiedIdentity,
  id: string,
  raw: SubmitPrivateDraftInput,
  connection?: Connection,
) {
  const input = submitPrivateDraftSchema.parse(raw);
  return reviewTransaction(
    identity,
    async (tx) => {
      const result = await mutateReviewedDraft(
        identity,
        tx,
        id,
        input.expectedVersion,
        "submit",
        null,
        input.reason,
        input.organisationId,
      );
      return {
        draft: result.draft,
        request: await getRequest(identity, result.requestId!, tx),
      };
    },
    connection,
  );
}
