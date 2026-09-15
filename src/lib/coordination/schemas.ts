import { z } from "zod";
import { createPlanSchema, planningNightSchema } from "@/lib/plans/schemas";

const uuid = z.uuid();
const note = z.string().trim().min(1).max(1000);
const timestamp = z.iso.datetime({ offset: true });
export const coordinationParametersSchema = createPlanSchema.omit({ expectedBasis: true });
export const createCaseSchema = z.object({
  sourcePlanId: uuid,
  selectedRequestIds: z.array(z.string().min(1).max(64)).min(1).max(100).refine(ids => new Set(ids).size === ids.length),
  idempotencyKey: uuid,
  parameters: coordinationParametersSchema,
  deadline: timestamp.nullable().optional(),
}).strict();
const version = { expectedVersion: z.number().int().positive() };
const revision = { ...version, revision: z.number().int().positive() };
export const caseActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("revise"), ...version, sourcePlanId: uuid, parameters: coordinationParametersSchema }).strict(),
  z.object({ action: z.literal("approve"), ...revision, organisationId: uuid, confirmedAt: timestamp, note }).strict(),
  z.object({ action: z.literal("request-changes"), ...revision, note }).strict(),
  z.object({ action: z.literal("apply"), ...revision, idempotencyKey: uuid }).strict(),
  z.object({ action: z.literal("assign"), ...version, ownerId: uuid }).strict(),
  z.object({ action: z.literal("deadline"), ...version, deadline: timestamp.nullable() }).strict(),
  ...(["escalate", "close", "reopen", "withdraw"] as const).map(action => z.object({ action: z.literal(action), ...version, note }).strict()),
]);
export const caseFiltersSchema = z.object({
  planningNight: planningNightSchema.optional(),
  state: z.enum(["open", "closed"]).optional(),
  ownerId: uuid.optional(),
  appliedPlanId: uuid.optional(),
  overdue: z.enum(["true", "false"]).optional(),
  pending: z.enum(["true", "false"]).optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type CaseActionInput = z.infer<typeof caseActionSchema>;
export type CaseFilters = z.input<typeof caseFiltersSchema>;
