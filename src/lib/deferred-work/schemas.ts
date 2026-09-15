import { z } from "zod";
import { planningNightSchema } from "@/lib/plans/schemas";
const uuid = z.uuid();
const note = z.string().trim().min(1).max(1000);
const version = { expectedVersion: z.number().int().min(1).max(2147483646) };
export const recordDeferralSchema = z.object({ planId: uuid, requestId: z.string().min(1).max(64), reason: note, idempotencyKey: uuid }).strict();
export const workItemActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), ...version, ownerId: uuid.nullable().optional(), dueDate: planningNightSchema.nullable().optional(), priority: z.enum(["critical", "high", "medium", "low"]).optional(), repeatThreshold: z.number().int().min(1).max(100).optional() }).strict().refine(v => [v.ownerId, v.dueDate, v.priority, v.repeatThreshold].some(x => x !== undefined), "Supply metadata to update."),
  z.object({ action: z.literal("propose-night"), ...version, planningNight: planningNightSchema, note }).strict(),
  ...(["complete", "cancel", "reopen", "escalate"] as const).map(action => z.object({ action: z.literal(action), ...version, note }).strict()),
]);
export const workItemFiltersSchema = z.object({
  ownerId: uuid.optional(), planningNight: planningNightSchema.optional(),
  state: z.enum(["open", "scheduled", "completed", "cancelled"]).optional(),
  overdue: z.enum(["true", "false"]).optional(), repeated: z.enum(["true", "false"]).optional(),
  missingDue: z.enum(["true", "false"]).optional(), cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
export type RecordDeferralInput = z.infer<typeof recordDeferralSchema>;
export type WorkItemActionInput = z.infer<typeof workItemActionSchema>;
export type WorkItemFilters = z.input<typeof workItemFiltersSchema>;
