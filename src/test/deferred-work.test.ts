import { describe, expect, it } from "vitest";
import { effectiveDeferredNights, workItemFlags } from "@/lib/deferred-work/projection";
import { recordDeferralSchema, workItemActionSchema, workItemFiltersSchema } from "@/lib/deferred-work/schemas";

describe("deferred work projections", () => {
  it("counts distinct effective nights and preserves same-night corrections", () => {
    expect(effectiveDeferredNights([
      { night: "2026-09-16", kind: "deferred" },
      { night: "2026-09-16", kind: "deferred" },
      { night: "2026-09-17", kind: "deferred" },
      { night: "2026-09-16", kind: "scheduled" },
    ])).toEqual(["2026-09-17"]);
    expect(effectiveDeferredNights([{ night: "2026-09-16", kind: "scheduled" }, { night: "2026-09-16", kind: "deferred" }])).toEqual(["2026-09-16"]);
  });
  it("compares SGT calendar dates and leaves scheduled work unresolved", () => {
    const item = { state: "scheduled" as const, dueDate: "2026-09-16", ownerId: "planner", repeatThreshold: 2, effectiveDeferredNights: ["2026-09-15"], proposedNight: null };
    expect(workItemFlags(item, "2026-09-16").overdue).toBe(false);
    expect(workItemFlags(item, "2026-09-17").overdue).toBe(true);
    for (const state of ["completed", "cancelled"] as const) expect(workItemFlags({ ...item, state }, "2026-09-17").overdue).toBe(false);
  });
  it("signals missing data and a configurable distinct-night threshold", () => {
    const item = { state: "open" as const, dueDate: null, ownerId: null, repeatThreshold: 2, effectiveDeferredNights: ["2026-09-15", "2026-09-15"], proposedNight: "2026-09-17" };
    expect(workItemFlags(item, "2026-09-16")).toEqual({ overdue: false, repeated: false, missingDueDate: true, missingOwner: true, awaitingTargetNightReview: true });
    expect(workItemFlags({ ...item, effectiveDeferredNights: ["2026-09-15", "2026-09-16"] }, "2026-09-16").repeated).toBe(true);
  });
});
describe("deferred work input boundaries", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("rejects client identity/results, impossible dates and oversized queries", () => {
    expect(recordDeferralSchema.safeParse({ planId: id, requestId: "M-001", reason: "Record", idempotencyKey: id, actorId: id }).success).toBe(false);
    expect(workItemActionSchema.safeParse({ action: "update", expectedVersion: 1, dueDate: "2026-02-30" }).success).toBe(false);
    expect(workItemFiltersSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(workItemFiltersSchema.safeParse({ state: "approved" }).success).toBe(false);
  });
  it("requires lifecycle notes and optimistic versions and bounds policy", () => {
    expect(workItemActionSchema.safeParse({ action: "complete", expectedVersion: 1, note: " " }).success).toBe(false);
    expect(workItemActionSchema.safeParse({ action: "cancel", note: "Cancelled" }).success).toBe(false);
    expect(workItemActionSchema.safeParse({ action: "complete", expectedVersion: 1, note: "x".repeat(1001) }).success).toBe(false);
    expect(workItemActionSchema.safeParse({ action: "update", expectedVersion: 1, repeatThreshold: 0 }).success).toBe(false);
    expect(workItemActionSchema.safeParse({ action: "update", expectedVersion: 1 }).success).toBe(false);
  });
});
