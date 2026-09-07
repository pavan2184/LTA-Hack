// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import {
  workforceRoleSchema,
  workforceAvailabilitySchema,
  workforceDemandSchema,
  workforceInputSchema,
} from "@/lib/http/workforce-schemas";
describe("workforce write payload schemas", () => {
  it("bounds fields/counts and rejects named-person data", () => {
    expect(
      workforceRoleSchema.safeParse({ id: "technician", name: "Technician" })
        .success,
    ).toBe(true);
    expect(
      workforceRoleSchema.safeParse({
        id: "x",
        name: "Technician",
        workerName: "person",
      }).success,
    ).toBe(false);
    const facts = buildInstanceFromLiterals();
    expect(
      workforceAvailabilitySchema.safeParse({
        ...facts.workforceAvailability[0],
        count: -1,
      }).success,
    ).toBe(false);
    expect(
      workforceDemandSchema.safeParse({ ...facts.workforceDemand[0], count: 0 })
        .success,
    ).toBe(false);
    expect(
      workforceAvailabilitySchema.safeParse({
        ...facts.workforceAvailability[0],
        endMinute: 0,
      }).success,
    ).toBe(false);
  });
  it("validates request/team/role/night references and rejects duplicate/overlapping batches", () => {
    const facts = buildInstanceFromLiterals(),
      schema = workforceInputSchema(facts);
    const input = {
      availability: facts.workforceAvailability,
      demand: facts.workforceDemand,
    };
    expect(schema.safeParse(input).success).toBe(true);
    expect(
      schema.safeParse({
        ...input,
        demand: [{ ...input.demand[0], requestId: "missing" }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...input,
        availability: [{ ...input.availability[0], teamId: "missing" }],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...input, demand: [...input.demand, input.demand[0]] })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...input,
        availability: [...input.availability, input.availability[0]],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...input,
        availability: Array(1001).fill(input.availability[0]),
      }).success,
    ).toBe(false);
  });
});
