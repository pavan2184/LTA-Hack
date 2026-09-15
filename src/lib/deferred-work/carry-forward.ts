import type { TransactionSql } from "postgres";
import { z } from "zod";
import type { VerifiedIdentity } from "@/lib/auth/session";
import type { Sql } from "@/lib/db/client";
import { transaction } from "@/lib/plans/service";
import { planIdSchema, planningNightSchema } from "@/lib/plans/schemas";
import { DeferredWorkError } from "./service";

export const prepareCarryForwardSchema = z.object({
  expectedVersion: z.number().int().min(1).max(2147483646),
  targetNight: planningNightSchema,
  organisationId: z.uuid().optional(),
  idempotencyKey: z.uuid(),
}).strict();
export type PrepareCarryForwardInput = z.infer<typeof prepareCarryForwardSchema>;

export async function prepareCarryForward(
  identity: VerifiedIdentity,
  itemId: string,
  raw: PrepareCarryForwardInput,
  connection?: Sql | TransactionSql,
): Promise<{ requestId: string }> {
  planIdSchema.parse(itemId);
  const input = prepareCarryForwardSchema.parse(raw);
  return transaction(identity, async tx => {
    const [{ result }] = await tx<{ result: { requestId: string; error?: DeferredWorkError["code"] } }[]>`
      select railplan_private.prepare_carry_forward(${itemId}::uuid,${tx.json(input)}) as result`;
    if (result.error) throw new DeferredWorkError(result.error);
    return { requestId: result.requestId };
  }, connection);
}
