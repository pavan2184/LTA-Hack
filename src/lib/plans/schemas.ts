import { z } from "zod";
export const planningNightSchema = z.iso
  .date()
  .refine(
    (value) => value >= "2000-01-01" && value <= "2100-12-31",
    "Planning night must be between 2000 and 2100.",
  );
export const planIdSchema = z.uuid();
export const previewBasisSchema = z
  .object({
    planId: planIdSchema,
    sourceRevision: z.string().regex(/^\d{1,20}$/),
    solverVersion: z.string().min(1).max(100),
    constraintVersion: z.string().min(1).max(100),
    inputDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();
export const createPlanSchema = z
  .object({
    expectedBasis: previewBasisSchema.optional(),
    basedOnPlanId: planIdSchema.optional(),
    planningNight: planningNightSchema,
    strategy: z
      .enum([
        "balanced",
        "max-completion",
        "min-risk",
        "min-changes",
        "emergency-buffer",
      ])
      .default("balanced"),
    locked: z
      .array(
        z
          .object({
            requestId: z.string().min(1).max(64),
            teamId: z.string().min(1).max(64),
            startMinute: z.number().int().min(0).max(1440),
            endMinute: z.number().int().min(1).max(2880),
            locked: z.boolean().optional(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();
export const decisionSchema = z
  .object({
    kind: z.enum(["note", "accept", "reject"]),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export const publishPlanSchema = z.object({}).strict();
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
export const analysisSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("conflicts"),
    strategy: createPlanSchema.shape.strategy.removeDefault(),
    locked: createPlanSchema.shape.locked.removeDefault().optional(),
  }).strict(),
  z.object({
    operation: z.literal("repair"),
    strategy: createPlanSchema.shape.strategy.removeDefault(),
    locked: createPlanSchema.shape.locked.removeDefault().optional(),
    violationId: z.string().min(1).max(200),
  }).strict(),
  z
    .object({
      operation: z.literal("inspect"),
      requestId: z.string().min(1).max(64),
      strategy: createPlanSchema.shape.strategy.removeDefault().optional(),
      locked: createPlanSchema.shape.locked.removeDefault().optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("preview"),
      strategy: createPlanSchema.shape.strategy.removeDefault(),
      locked: createPlanSchema.shape.locked.removeDefault().optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("compare-objectives"),
      locked: createPlanSchema.shape.locked.removeDefault().optional(),
    })
    .strict(),
]);
export type AnalysisInput = z.infer<typeof analysisSchema>;
