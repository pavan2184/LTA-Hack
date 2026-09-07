import { describe, expect, it } from "vitest";
import {
  buildInstanceFromLiterals,
  instanceDigest,
  canonicalise,
} from "../domain/instance";
import { assertWorkforceInstance } from "../domain/workforce";
import { solve } from "../engine/solve";
import { buildWorld } from "../domain/world";

describe("anonymous workforce facts", () => {
  it("provides explicit role supply and per-request demand without changing crew capacity", () => {
    const instance = buildInstanceFromLiterals();
    expect(instance.workforceRoles).toHaveLength(2);
    expect(instance.workforceAvailability.length).toBeGreaterThan(0);
    expect(new Set(instance.workforceDemand.map((d) => d.requestId)).size).toBe(
      instance.requests.length,
    );
    expect(() => assertWorkforceInstance(instance)).not.toThrow();
    const team = instance.teams.find((t) => t.id === "T-TRK")!;
    expect(team.capacity).toBe(1);
    expect(
      instance.workforceAvailability.find(
        (a) => a.teamId === team.id && a.roleId === "technician",
      )!.count,
    ).toBe(4);
    expect(
      solve({ strategy: "balanced", context: { world: buildWorld(instance) } })
        .independentlyValidated,
    ).toBe(true);
  });
  it("canonicalizes roles, availability and demand independently of row order", () => {
    const facts = buildInstanceFromLiterals();
    const reversed = {
      ...facts,
      workforceRoles: [...facts.workforceRoles].reverse(),
      workforceAvailability: [...facts.workforceAvailability].reverse(),
      workforceDemand: [...facts.workforceDemand].reverse(),
    };
    expect(canonicalise(reversed)).toEqual(canonicalise(facts));
    expect(instanceDigest(reversed)).toBe(instanceDigest(facts));
    expect(
      instanceDigest({
        ...facts,
        workforceAvailability: facts.workforceAvailability.map((a, i) =>
          i ? a : { ...a, count: a.count + 1 },
        ),
      }),
    ).not.toBe(instanceDigest(facts));
    expect(
      instanceDigest({
        ...facts,
        workforceDemand: facts.workforceDemand.map((d, i) =>
          i ? d : { ...d, count: d.count + 1 },
        ),
      }),
    ).not.toBe(instanceDigest(facts));
  });
  it("rejects unknown references, invalid numbers, duplicate keys, overlap and cross-night data", () => {
    const facts = buildInstanceFromLiterals();
    const availability = facts.workforceAvailability[0],
      demand = facts.workforceDemand[0];
    for (const change of [
      { count: -1 },
      { count: 1.5 },
      { count: 10001 },
      { teamId: "unknown" },
      { roleId: "unknown" },
      { planningNight: "2099-01-01" },
      { startMinute: -1 },
      { endMinute: 241 },
      { startMinute: 120, endMinute: 120 },
    ])
      expect(() =>
        assertWorkforceInstance({
          ...facts,
          workforceAvailability: [{ ...availability, ...change }],
        }),
      ).toThrow();
    for (const change of [
      { count: 0 },
      { count: -1 },
      { count: 1.5 },
      { count: 10001 },
      { roleId: "unknown" },
      { requestId: "unknown" },
    ])
      expect(() =>
        assertWorkforceInstance({
          ...facts,
          workforceDemand: [{ ...demand, ...change }],
        }),
      ).toThrow();
    expect(() =>
      assertWorkforceInstance({
        ...facts,
        workforceRoles: [...facts.workforceRoles, facts.workforceRoles[0]],
      }),
    ).toThrow();
    expect(() =>
      assertWorkforceInstance({ ...facts, workforceDemand: [demand, demand] }),
    ).toThrow();
    expect(() =>
      assertWorkforceInstance({
        ...facts,
        workforceAvailability: [
          availability,
          { ...availability, startMinute: 15 },
        ],
      }),
    ).toThrow();
  });
  it("allows adjacent replacement supply windows and zero availability", () => {
    const facts = buildInstanceFromLiterals(),
      row = facts.workforceAvailability[0];
    expect(() =>
      assertWorkforceInstance({
        ...facts,
        workforceAvailability: [
          { ...row, startMinute: 0, endMinute: 120, count: 0 },
          { ...row, startMinute: 120, endMinute: 240 },
        ],
      }),
    ).not.toThrow();
  });
});
