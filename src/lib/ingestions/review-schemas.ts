import { z } from "zod";
import {
  REQUEST_FIELD_KEYS,
  type NullableRequestFields,
  type RequestFieldKey,
} from "@railplan/core/types/ingestions";
import { nullableFieldsSchema } from "./schemas";
const version = z.number().int().min(1).max(2147483647);
const reason = z.string().trim().min(1, "Explain this change.").max(2000);
export const editPrivateDraftSchema = z
  .object({
    expectedVersion: version,
    fields: nullableFieldsSchema.transform((fields) => ({
      ...fields,
      title: fields.title?.trim() || null,
      description: fields.description?.trim() || null,
    })),
    reason,
  })
  .strict();
export const submitPrivateDraftSchema = z
  .object({
    expectedVersion: version,
    reason,
    organisationId: z.uuid().optional(),
  })
  .strict();
export type EditPrivateDraftInput = z.infer<typeof editPrivateDraftSchema>;
export type SubmitPrivateDraftInput = z.infer<typeof submitPrivateDraftSchema>;
export function privateDraftMissingFields(
  fields: NullableRequestFields,
): RequestFieldKey[] {
  return REQUEST_FIELD_KEYS.filter(
    (k) =>
      fields[k] === null ||
      ((k === "title" || k === "description") && !fields[k]?.trim()) ||
      ((k === "blockIds" || k === "workforce") && fields[k]?.length === 0),
  );
}

import type {
  RequestCatalogue,
  RequestFields,
} from "@railplan/core/types/requests";
import { validateFields } from "@/lib/requests/schemas";
export function privateDraftValidationErrors(
  f: NullableRequestFields,
  c: RequestCatalogue,
): Record<string, string> {
  const errors = Object.fromEntries(
    privateDraftMissingFields(f).map((k) => [
      k,
      "Complete this field before submitting.",
    ]),
  );
  if (REQUEST_FIELD_KEYS.every((k) => f[k] !== null))
    return { ...errors, ...validateFields(f as RequestFields, c, true) };
  if (
    f.planningNight !== null &&
    !c.nights.some((n) => n.planningNight === f.planningNight)
  )
    errors.planningNight = "Choose a known planning night.";
  if (f.workClass !== null && !c.workClasses.includes(f.workClass))
    errors.workClass = "Choose a known work class.";
  if (
    f.blockIds !== null &&
    (new Set(f.blockIds).size !== f.blockIds.length ||
      f.blockIds.some((id) => !c.blocks.some((b) => b.id === id)))
  )
    errors.blockIds = "Select distinct known blocks.";
  f.equipment?.forEach((e, i) => {
    const known = c.equipment.find((r) => r.id === e.equipmentId);
    if (!known)
      errors[`equipment.${i}.equipmentId`] = "Choose a known equipment type.";
    else if (e.units > known.capacity)
      errors[`equipment.${i}.units`] =
        "Requested units exceed equipment capacity.";
  });
  f.workforce?.forEach((w, i) => {
    if (!c.roles.some((r) => r.id === w.roleId))
      errors[`workforce.${i}.roleId`] = "Choose a known workforce role.";
  });
  return errors;
}
