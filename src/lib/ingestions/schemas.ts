import { z } from "zod";
import {
  REQUEST_FIELD_KEYS,
  type RequestFieldKey,
} from "@railplan/core/types/ingestions";
import { fieldsSchema } from "@/lib/requests/schemas";
const shape = Object.fromEntries(
  REQUEST_FIELD_KEYS.map((key) => [key, fieldsSchema.shape[key].nullable()]),
) as { [K in RequestFieldKey]: z.ZodNullable<(typeof fieldsSchema.shape)[K]> };
export const nullableFieldsSchema = z.object(shape).strict();
export const confidenceSchema = z
  .object(
    Object.fromEntries(
      REQUEST_FIELD_KEYS.map((key) => [
        key,
        z.number().min(0).max(1).nullable(),
      ]),
    ) as Record<RequestFieldKey, z.ZodNullable<z.ZodNumber>>,
  )
  .strict();
export const rawEvidenceSchema = z
  .object({
    field: z.enum(REQUEST_FIELD_KEYS),
    quote: z.string().min(1).max(256),
    timestamp: z.string().max(32).nullable(),
  })
  .strict();
export const extractionSchema = z
  .object({
    drafts: z
      .array(
        z
          .object({
            fields: nullableFieldsSchema,
            confidence: confidenceSchema,
            evidence: z.array(rawEvidenceSchema).max(24),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();
export const proposalSchema = z
  .object({
    fields: nullableFieldsSchema,
    confidence: confidenceSchema,
    missingFields: z
      .array(z.enum(REQUEST_FIELD_KEYS))
      .max(REQUEST_FIELD_KEYS.length),
    evidence: z
      .array(
        rawEvidenceSchema.extend({
          start: z.number().int().min(0).max(65536),
          end: z.number().int().min(1).max(65536),
        }),
      )
      .max(24),
  })
  .strict();
export const savedBatchSchema = z.array(proposalSchema).min(1).max(8);
