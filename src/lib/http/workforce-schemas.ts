import { z } from "zod";
import type { PlanningInstance } from "@railplan/core/domain/instance";
import { assertWorkforceInstance } from "@railplan/core/domain/workforce";
import { MAX_WORKFORCE_COUNT } from "@railplan/core/types/workforce";
import { planningNightSchema } from "@/lib/plans/schemas";
const id = z.string().trim().min(1).max(64);
export const workforceRoleSchema = z
  .object({ id, name: z.string().trim().min(1).max(120) })
  .strict();
export const workforceAvailabilitySchema = z
  .object({
    planningNight: planningNightSchema,
    teamId: id,
    roleId: id,
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(1).max(2880),
    count: z.number().int().min(0).max(MAX_WORKFORCE_COUNT),
  })
  .strict()
  .refine(
    (row) => row.endMinute > row.startMinute,
    "Availability must end after it starts.",
  );
export const workforceDemandSchema = z
  .object({
    requestId: id,
    roleId: id,
    count: z.number().int().min(1).max(MAX_WORKFORCE_COUNT),
  })
  .strict();
/** A bounded replacement payload for one selected night. Later write routes must
 * construct this with trusted loaded facts, never client-supplied role catalogs. */
export function workforceInputSchema(instance: PlanningInstance) {
  return z
    .object({
      availability: z.array(workforceAvailabilitySchema).max(1000),
      demand: z.array(workforceDemandSchema).max(1000),
    })
    .strict()
    .superRefine((input, ctx) => {
      try {
        assertWorkforceInstance({
          ...instance,
          workforceAvailability: input.availability,
          workforceDemand: input.demand,
        });
      } catch {
        ctx.addIssue({
          code: "custom",
          message:
            "Workforce inputs must use this night’s known roles, teams and requests, with unique demands and non-overlapping availability inside its window.",
        });
      }
    });
}
