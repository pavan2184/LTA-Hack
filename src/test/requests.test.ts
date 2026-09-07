// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  fieldsSchema,
  approvalSchema,
  actionSchema,
  validateFields,
} from "@/lib/requests/schemas";
import type {
  RequestCatalogue,
  RequestFields,
} from "@railplan/core/types/requests";
const catalogue: RequestCatalogue = {
  nights: [
    {
      planningNight: "2026-08-03",
      startMinute: 0,
      endMinute: 240,
      slotMinutes: 15,
    },
  ],
  blocks: [{ id: "A-B", label: "A–B" }],
  workClasses: ["civil"],
  equipment: [{ id: "E", name: "Tool", capacity: 1 }],
  roles: [{ id: "R", name: "Role" }],
};
const fields: RequestFields = {
  planningNight: "2026-08-03",
  title: "Inspection",
  description: "Inspect walkway",
  workClass: "civil",
  blockIds: ["A-B"],
  durationMinutes: 30,
  preferredStart: 30,
  earliestStart: 0,
  latestEnd: 240,
  equipment: [{ equipmentId: "E", units: 1 }],
  workforce: [{ roleId: "R", count: 1 }],
};
describe("contractor intake boundary", () => {
  it("allows incomplete drafts but requires title, description, blocks and demand on submit", () => {
    const draft = {
      ...fields,
      title: "",
      description: "",
      blockIds: [],
      workforce: [],
    };
    expect(validateFields(draft, catalogue, false)).toEqual({});
    expect(Object.keys(validateFields(draft, catalogue, true))).toEqual(
      expect.arrayContaining(["title", "description", "blockIds", "workforce"]),
    );
  });
  it("returns field errors for unknown references, impossible duration and night bounds", () => {
    const bad = {
      ...fields,
      blockIds: ["unknown"],
      durationMinutes: 300,
      earliestStart: -1,
      equipment: [{ equipmentId: "?", units: 2 }],
      workforce: [{ roleId: "?", count: 1 }],
    };
    expect(Object.keys(validateFields(bad, catalogue, true))).toEqual(
      expect.arrayContaining([
        "blockIds",
        "durationMinutes",
        "earliestStart",
        "equipment.0.equipmentId",
        "workforce.0.roleId",
      ]),
    );
  });
  it("rejects excess counts, duplicates, forged internal fields and unsafely approved input", () => {
    expect(
      fieldsSchema.safeParse({ ...fields, organisationId: "other" }).success,
    ).toBe(false);
    expect(
      fieldsSchema.safeParse({
        ...fields,
        workforce: [{ roleId: "R", count: 0 }],
      }).success,
    ).toBe(false);
    expect(
      validateFields(
        { ...fields, equipment: [{ equipmentId: "E", units: 2 }] },
        catalogue,
        true,
      ),
    ).toHaveProperty("equipment.0.units");
    expect(
      validateFields({ ...fields, blockIds: ["A-B", "A-B"] }, catalogue, true),
    ).toHaveProperty("blockIds");
    expect(
      approvalSchema.safeParse({
        teamId: "T",
        priority: "high",
        clearanceMinutes: 0,
        requiredSkills: [],
        dependencies: [],
        dependencyLagMinutes: 0,
        safetyConfirmed: false,
      }).success,
    ).toBe(false);
    expect(
      actionSchema.safeParse({
        expectedVersion: 0,
        action: "approve",
        reason: "",
      }).success,
    ).toBe(false);
  });
});
describe("approved intake reference integrity", () => {
  it("fails closed if a planning instance has a missing or cross-night dependency", async () => {
    const { assertRequestReferences } = await import("@/lib/requests/instance");
    const { buildInstanceFromLiterals } = await import(
      "@railplan/core/domain/instance"
    );
    const facts = buildInstanceFromLiterals();
    expect(() => assertRequestReferences(facts)).not.toThrow();
    expect(() =>
      assertRequestReferences({
        ...facts,
        requests: facts.requests.map((r, i) =>
          i === 0 ? { ...r, dependencies: ["missing"] } : r,
        ),
      }),
    ).toThrow(/dependency/);
  });
});
