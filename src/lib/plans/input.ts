import { createHash } from "node:crypto";
import { stableStringify } from "@railplan/core/engine/hash";
import {
  canonicalise,
  type PlanningInstance,
} from "@railplan/core/domain/instance";
import type { CreatePlanInput } from "./schemas";
export class PlanError extends Error {
  constructor(
    public readonly code:
      "not_found" | "invalid_request" | "stale_plan" | "invalid_plan",
    message: string,
  ) {
    super(message);
  }
}
export function validatePlanParameters(
  facts: PlanningInstance,
  input: CreatePlanInput,
) {
  const seen = new Set<string>();
  for (const pin of input.locked) {
    const request = facts.requests.find((r) => r.id === pin.requestId);
    if (
      !request ||
      seen.has(pin.requestId) ||
      pin.teamId !== request.teamId ||
      !facts.teams.some((t) => t.id === pin.teamId) ||
      pin.startMinute <
        Math.max(facts.window.startMinute, request.earliestStart) ||
      pin.endMinute > Math.min(facts.window.endMinute, request.latestEnd) ||
      pin.endMinute !== pin.startMinute + request.durationMinutes
    ) {
      throw new PlanError(
        "invalid_request",
        "Pins must uniquely identify requests in this night and use their assigned team, duration and allowed window.",
      );
    }
    seen.add(pin.requestId);
  }
}
export function planInputDigest(
  facts: PlanningInstance,
  input: CreatePlanInput,
): string {
  const parameters = {
    planningNight: input.planningNight,
    strategy: input.strategy,
    locked: input.locked
      .map((p) => ({ ...p, locked: true }))
      .sort((a, b) => a.requestId.localeCompare(b.requestId)),
  };
  return (
    "sha256:" +
    createHash("sha256")
      .update(stableStringify({ facts: canonicalise(facts), parameters }))
      .digest("hex")
  );
}
