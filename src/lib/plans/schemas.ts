import { z } from "zod";
export const planningNightSchema = z.iso
  .date()
  .refine(
    (value) => value >= "2000-01-01" && value <= "2100-12-31",
    "Planning night must be between 2000 and 2100.",
  );
export const planIdSchema = z.uuid();
export const createPlanSchema = z
  .object({
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
