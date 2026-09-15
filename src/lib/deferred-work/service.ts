import type { TransactionSql } from "postgres";
import type { WorkItem, PlannerWorkItem, WorkItemPage } from "@railplan/core/types/deferred-work";
import { withAuthenticatedTransaction, type VerifiedIdentity } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/permissions";
import type { Sql } from "@/lib/db/client";
import { transaction } from "@/lib/plans/service";
import { planIdSchema } from "@/lib/plans/schemas";
import { recordDeferralSchema, workItemActionSchema, workItemFiltersSchema, type RecordDeferralInput, type WorkItemActionInput, type WorkItemFilters } from "./schemas";

type Connection = Sql | TransactionSql;
export class DeferredWorkError extends Error {
  constructor(public readonly code: "not_found" | "forbidden" | "conflict" | "invalid_request") {
    super(code === "conflict" ? "This work item changed. Reload before trying again." : code === "not_found" ? "This work item does not exist." : code === "forbidden" ? "You cannot perform this work-item action." : "Check the saved deferral and work-item fields.");
  }
}
function check(result: { id: string; error?: DeferredWorkError["code"] }) {
  if (result.error) throw new DeferredWorkError(result.error);
  return result.id;
}
async function readItem(tx: TransactionSql, id: string): Promise<WorkItem> {
  const [{ value }] = await tx<{ value: WorkItem | null }[]>`select railplan_private.read_work_item(${id}::uuid,true) as value`;
  if (!value) throw new DeferredWorkError("not_found");
  return value;
}
export async function getWorkItem(identity: VerifiedIdentity, id: string, connection?: Connection): Promise<WorkItem> {
  planIdSchema.parse(id);
  return withAuthenticatedTransaction(identity, tx => readItem(tx, id), connection);
}
export async function listWorkItems(identity: VerifiedIdentity, raw: WorkItemFilters = {}, connection?: Connection): Promise<WorkItemPage> {
  const filters = workItemFiltersSchema.parse(raw);
  return withAuthenticatedTransaction(identity, async (tx, actor) => {
    if (actor.role !== "planner" && filters.ownerId) throw new AuthError("forbidden");
    const rows = await tx<{ value: WorkItem }[]>`select railplan_private.list_work_items(${tx.json(filters)}) as value`;
    const items = rows.slice(0, filters.limit).map(r => r.value);
    const [{ catalogue }] = await tx<{ catalogue: Pick<WorkItemPage, "nights" | "owners" | "today"> }[]>`select railplan_private.work_item_catalogue() as catalogue`;
    return { items, nextCursor: rows.length > filters.limit ? items.at(-1)!.id : null, ...catalogue };
  }, connection, "repeatable read");
}
async function readPlannerItem(tx: TransactionSql, id: string): Promise<PlannerWorkItem> {
  const item = await readItem(tx, id);
  if (item.scope !== "planner") throw new AuthError("forbidden");
  return item;
}
export async function recordDeferral(identity: VerifiedIdentity, raw: RecordDeferralInput, connection?: Connection): Promise<PlannerWorkItem> {
  const input = recordDeferralSchema.parse(raw);
  return transaction(identity, async tx => {
    const [{ value }] = await tx<{ value: { id: string; error?: DeferredWorkError["code"] } }[]>`select railplan_private.record_work_deferral(${tx.json(input)}) as value`;
    return readPlannerItem(tx, check(value));
  }, connection);
}
export async function actOnWorkItem(identity: VerifiedIdentity, id: string, raw: WorkItemActionInput, connection?: Connection): Promise<PlannerWorkItem> {
  planIdSchema.parse(id);
  const input = workItemActionSchema.parse(raw);
  return transaction(identity, async tx => {
    const [{ value }] = await tx<{ value: { id: string; error?: DeferredWorkError["code"] } }[]>`select railplan_private.mutate_work_item(${id}::uuid,${tx.json(input)}) as value`;
    return readPlannerItem(tx, check(value));
  }, connection);
}
