import type { TransactionSql } from "postgres";
import type {
  PrivateDraft,
  DraftProposal,
} from "@railplan/core/types/ingestions";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import type { Sql } from "@/lib/db/client";
import { getRequestCatalogue } from "@/lib/requests/service";
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
 select d.id,d.owner_id as "ownerId",d.organisation_id as "organisationId",d.current_version as version,d.status,
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
