// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  REQUEST_FIELD_KEYS,
  type NullableRequestFields,
} from "@railplan/core/types/ingestions";
import {
  editPrivateDraftSchema,
  submitPrivateDraftSchema,
  privateDraftMissingFields,
} from "@/lib/ingestions/review-schemas";
const empty = Object.fromEntries(
  REQUEST_FIELD_KEYS.map((k) => [k, null]),
) as NullableRequestFields;
describe("owner draft review contract", () => {
  it("keeps unknown values null, normalizes blank text and flags empty required arrays", () => {
    const parsed = editPrivateDraftSchema.parse({
      expectedVersion: 1,
      fields: {
        ...empty,
        title: "  ",
        description: "\n",
        equipment: [],
        blockIds: [],
        workforce: [],
      },
      reason: "Clarifying",
    });
    expect(parsed.fields.title).toBeNull();
    expect(parsed.fields.description).toBeNull();
    expect(parsed.fields.durationMinutes).toBeNull();
    expect(privateDraftMissingFields(parsed.fields)).toEqual(
      expect.arrayContaining([
        "title",
        "description",
        "durationMinutes",
        "blockIds",
        "workforce",
      ]),
    );
    expect(privateDraftMissingFields(parsed.fields)).not.toContain("equipment");
  });
  it("rejects supplied confidence/evidence/owner/internal fields and requires version/reason", () => {
    for (const extra of [
      { confidence: {} },
      { evidence: [] },
      { ownerId: "other" },
    ])
      expect(
        editPrivateDraftSchema.safeParse({
          expectedVersion: 1,
          fields: empty,
          reason: "Edit",
          ...extra,
        }).success,
      ).toBe(false);
    expect(
      editPrivateDraftSchema.safeParse({
        expectedVersion: 0,
        fields: empty,
        reason: "",
      }).success,
    ).toBe(false);
    expect(
      editPrivateDraftSchema.safeParse({
        expectedVersion: 1,
        fields: { ...empty, priority: "critical" },
        reason: "Edit",
      }).success,
    ).toBe(false);
    expect(
      submitPrivateDraftSchema.safeParse({
        expectedVersion: 1,
        reason: "Submit",
        organisationId: "fake",
      }).success,
    ).toBe(false);
  });
});
