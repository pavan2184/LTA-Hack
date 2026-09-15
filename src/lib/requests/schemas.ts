import { z } from "zod";
import { planningNightSchema } from "@/lib/plans/schemas";
import type {
  RequestCatalogue,
  RequestFields,
} from "@railplan/core/types/requests";
const id = z.string().trim().min(1).max(64);
const minute = z.number().int().min(0).max(2880);
export const fieldsSchema = z
  .object({
    planningNight: planningNightSchema,
    title: z.string().trim().max(160),
    description: z.string().trim().max(4000),
    workClass: z.enum([
      "track-possession",
      "traction-power",
      "signalling",
      "communications",
      "tunnel-systems",
      "civil",
      "platform-systems",
    ]),
    blockIds: z.array(id).max(100),
    durationMinutes: z.number().int().min(1).max(1440),
    preferredStart: minute,
    earliestStart: minute,
    latestEnd: minute,
    equipment: z
      .array(
        z
          .object({
            equipmentId: id,
            units: z.number().int().min(1).max(10000),
          })
          .strict(),
      )
      .max(100),
    workforce: z
      .array(
        z
          .object({ roleId: id, count: z.number().int().min(1).max(10000) })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const approvalSchema = z
  .object({
    teamId: id,
    priority: z.enum(["low", "medium", "high", "critical"]),
    clearanceMinutes: z.number().int().min(0).max(1440),
    requiredSkills: z.array(id).max(100),
    dependencies: z.array(id).max(100),
    dependencyLagMinutes: z.number().int().min(0).max(1440),
    safetyConfirmed: z.literal(true),
  })
  .strict();
export const createRequestSchema = z.object({ fields: fieldsSchema }).strict();
export const updateRequestSchema = z
  .object({
    expectedVersion: z.number().int().min(1).max(2147483647),
    fields: fieldsSchema,
  })
  .strict();
export const actionSchema = z
  .object({
    expectedVersion: z.number().int().min(1).max(2147483647),
    action: z.enum([
      "submit",
      "cancel",
      "revise",
      "needs_info",
      "approve",
      "reject",
    ]),
    reason: z.string().trim().max(2000),
    approval: approvalSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      ["approve", "reject", "needs_info", "cancel"].includes(v.action) &&
      !v.reason
    )
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Explain this decision.",
      });
    if (v.action === "approve" && !v.approval)
      ctx.addIssue({
        code: "custom",
        path: ["approval"],
        message: "Complete the planner fields.",
      });
    if (v.action !== "approve" && v.approval)
      ctx.addIssue({
        code: "custom",
        path: ["approval"],
        message: "Planner fields are only accepted for approval.",
      });
  });
export type RequestAction = z.infer<typeof actionSchema>;
export function validateFields(
  f: RequestFields,
  c: RequestCatalogue,
  complete: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const fail = (key: string, message: string) => {
    errors[key] = message;
  };
  const night = c.nights.find((n) => n.planningNight === f.planningNight);
  if (!night) fail("planningNight", "Choose a known planning night.");
  if (complete) {
    if (!f.title.trim()) fail("title", "Enter a title.");
    if (!f.description.trim()) fail("description", "Describe the work.");
    if (!f.blockIds.length) fail("blockIds", "Select at least one block.");
    if (!f.workforce.length) fail("workforce", "Add workforce demand.");
  }
  if (
    new Set(f.blockIds).size !== f.blockIds.length ||
    f.blockIds.some((id) => !c.blocks.some((b) => b.id === id))
  )
    fail("blockIds", "Select distinct known blocks.");
  if (!c.workClasses.includes(f.workClass))
    fail("workClass", "Choose a known work class.");
  if (night) {
    if (
      f.earliestStart < night.startMinute ||
      f.earliestStart >= night.endMinute
    )
      fail("earliestStart", "Start must be within the engineering window.");
    if (f.latestEnd > night.endMinute || f.latestEnd <= f.earliestStart)
      fail("latestEnd", "End must follow start within the engineering window.");
  }
  if (f.durationMinutes > f.latestEnd - f.earliestStart)
    fail("durationMinutes", "Duration must fit the permitted window.");
  if (
    f.preferredStart < f.earliestStart ||
    f.preferredStart + f.durationMinutes > f.latestEnd
  )
    fail("preferredStart", "Preferred work must fit the permitted window.");
  const eq = new Set<string>();
  f.equipment.forEach((r, i) => {
    const known = c.equipment.find((e) => e.id === r.equipmentId);
    if (!known || eq.has(r.equipmentId))
      fail(
        `equipment.${i}.equipmentId`,
        "Select a distinct known equipment type.",
      );
    else if (r.units > known.capacity)
      fail(
        `equipment.${i}.units`,
        "Requested units exceed the equipment capacity.",
      );
    eq.add(r.equipmentId);
  });
  const roles = new Set<string>();
  f.workforce.forEach((r, i) => {
    if (!c.roles.some((role) => role.id === r.roleId) || roles.has(r.roleId))
      fail(`workforce.${i}.roleId`, "Select a distinct known role.");
    roles.add(r.roleId);
  });
  return errors;
}

/** A contractor's answer to the published time for one request. */
export const acknowledgeSchema = z
  .object({
    planId: z.uuid(),
    kind: z.enum(["confirmed", "cannot_comply"]),
    reason: z.string().trim().max(2000).default(""),
  })
  .strict();
export type AcknowledgeInput = z.input<typeof acknowledgeSchema>;
