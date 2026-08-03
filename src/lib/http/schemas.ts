import { z } from "zod";

import { emergencyInsertion, disruptionById } from "@/data/disruptions";
import { requests, WINDOW_END } from "@/data/requests";
import { strategyProfiles } from "@/engine/strategies";
import type { StrategyId } from "@/types/railplan";

/**
 * The boundary between the browser and the engine.
 *
 * Two of these bounds are load-bearing rather than tidy. `strategy` is checked
 * against the profile map because `strategyProfiles[unknown]` is `undefined`
 * and the solver dereferences it — an unvalidated string was an unhandled 500.
 * `locked` is capped and its ids checked because every entry is re-validated at
 * every candidate start inside the solver, so an unbounded array is a CPU
 * amplification vector, not just untidy input.
 */

const strategyIds = Object.keys(strategyProfiles) as StrategyId[];
const disruptionIds = Object.keys(disruptionById);

/** Every request id the engine can plan, including the emergency insertion. */
const plannableIds = new Set<string>([
  ...requests.map((request) => request.id),
  emergencyInsertion.id,
]);

/**
 * One planner pin. Bounded on both ends of the window rather than left open:
 * the validator works in minutes from midnight and nothing legitimate sits
 * outside the engineering window plus a margin for an overrunning job.
 */
const placementSchema = z.object({
  requestId: z.string().refine((id) => plannableIds.has(id), {
    message: "unknown request id",
  }),
  startMinute: z.number().int().min(0).max(WINDOW_END),
  endMinute: z.number().int().min(0).max(WINDOW_END * 2),
  teamId: z.string().min(1).max(32),
  locked: z.boolean().optional(),
});

export const assistantRequestSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  strategy: z.enum(strategyIds as [StrategyId, ...StrategyId[]]).default("balanced"),
  view: z.enum(["submitted", "planned"]).default("submitted"),
  // One pin per plannable request is the most a planner can express. Anything
  // beyond that is not a plan, so it is refused rather than solved.
  locked: z.array(placementSchema).max(plannableIds.size).default([]),
  disruptionId: z
    .enum(disruptionIds as [string, ...string[]])
    .nullish()
    .transform((value) => value ?? null),
  /**
   * Prior questions only.
   *
   * The client used to send its own assistant turns back, which let anything
   * posting to this route put words in the assistant's mouth. The grounding
   * guard catches invented numbers, not injected instructions, so the fix is
   * structural: the server accepts what the planner asked and nothing else.
   */
  history: z
    .array(
      z.object({
        role: z.literal("user"),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .max(6)
    .default([]),
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

/** Largest request body accepted, before JSON parsing. */
export const MAX_BODY_BYTES = 64 * 1024;

/** First validation failure, phrased for a planner rather than a parser. */
export function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "The request was not in the expected shape.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}
