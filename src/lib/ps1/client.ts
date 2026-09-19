import { z } from "zod";

import type { Disruption } from "@railplan/ps1/engine/disruption";
import type { Pin } from "@railplan/ps1/engine/schedule";
import { validate } from "@railplan/ps1/engine/validate";
import type { Ps1Instance, Scenario, SolveOutcome } from "@railplan/ps1/types/ps1";

export interface Ps1SolveRequest {
  instance: Ps1Instance;
  scenario: Scenario;
  pins: Pin[];
  disruptions?: Disruption[];
}

const scenarioSchema = z.enum(["A", "B", "C"]);
const ecloSchema = z.union([z.literal(0), z.literal(1)]);
const responseSchema = z.object({
  outcome: z.object({
    status: z.enum(["FEASIBLE", "INFEASIBLE", "INVALID_INSTANCE"]),
    submission: z.object({
      scenario: scenarioSchema,
      access: z.array(z.object({
        activityId: z.string(), accessSeq: z.number().int(), week: z.number().int(),
        eclo: ecloSchema, accessNight: z.number().int(),
      })),
      occupancy: z.array(z.object({
        activityId: z.string(), week: z.number().int(), locationId: z.string(), coShareGroup: z.string(),
      })),
      results: z.array(z.object({
        scenario: scenarioSchema, contractNumber: z.string(),
        simulatedCompletionDate: z.string(), overrunDays: z.number(),
      })),
    }).optional(),
    diagnostics: z.object({
      startsTried: z.number().nonnegative(), candidatesEvaluated: z.number().nonnegative(),
      elapsedMs: z.number().nonnegative(), warnings: z.array(z.string()),
      rejectedPins: z.array(z.object({
        activityId: z.string(), week: z.number().int(), eclo: ecloSchema.optional(), reason: z.string(),
      })),
      solver: z.object({
        engine: z.literal("OR-Tools CP-SAT"), version: z.string().optional(),
        status: z.enum(["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN"]),
        scope: z.literal("full-local-model"), workers: z.number().int().positive(),
        searchSeconds: z.number().nonnegative(), bestBound: z.number().nullable(),
        absoluteGap: z.number().nonnegative().nullable(), relativeGap: z.number().nonnegative().nullable(),
        nativeSolveMs: z.number().nonnegative().nullable(),
        incumbentSource: z.enum(["cp-sat", "heuristic", "none"]),
      }).optional(),
    }),
  }),
});

/** Server computation is read-only; each returned plan still passes the local checker. */
export async function requestPs1Solve(
  request: Ps1SolveRequest,
  signal?: AbortSignal,
): Promise<SolveOutcome> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 90_000);
  try {
    controller.signal.throwIfAborted();
    const response = await fetch("/api/ps1/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    // A transport may finish just as cancellation arrives. Never accept its late result.
    controller.signal.throwIfAborted();
    if (!response.ok) {
      const error = z.object({ error: z.object({ message: z.string() }) }).safeParse(body);
      throw new Error(error.success ? error.data.error.message : "The scheduling service could not complete this run. Please try again.");
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) throw new Error("The scheduling service returned an invalid response. Please try again.");
    const outcome = parsed.data.outcome;
    if (outcome.submission && outcome.submission.scenario !== request.scenario) {
      throw new Error("The scheduling service returned a different scenario. This result was not applied.");
    }
    const report = outcome.submission
      ? validate(request.instance, outcome.submission, undefined, request.disruptions ?? [])
      : undefined;
    if (outcome.status === "FEASIBLE") {
      if (!outcome.submission || !report?.feasible || outcome.diagnostics.rejectedPins.length > 0) {
        throw new Error("The scheduling service returned a schedule that failed local checks. This result was not applied.");
      }
      const accesses = new Set(outcome.submission.access.map((row) => `${row.activityId}|${row.week}|${row.eclo}`));
      if (request.pins.some((pin) => !accesses.has(`${pin.activityId}|${pin.week}|${pin.eclo ?? 0}`))) {
        throw new Error("The scheduling service did not preserve every pin. This result was not applied.");
      }
      const solver = outcome.diagnostics.solver;
      const score = report.objectiveScore!;
      if (solver?.bestBound !== null && solver?.bestBound !== undefined) {
        const gap = Math.max(0, score - solver.bestBound);
        const relative = gap / Math.max(1, Math.abs(score));
        const tolerance = 0.00001;
        if (solver.bestBound > score + tolerance ||
          (solver.absoluteGap !== null && Math.abs(solver.absoluteGap - gap) > tolerance) ||
          (solver.relativeGap !== null && Math.abs(solver.relativeGap - relative) > tolerance) ||
          (solver.status === "OPTIMAL" && gap > tolerance)) {
          throw new Error("The scheduling service returned inconsistent proof diagnostics. This result was not applied.");
        }
      } else if (solver?.status === "OPTIMAL") {
        throw new Error("The scheduling service omitted the bound for its optimality claim. This result was not applied.");
      }
    }
    return { ...outcome, validation: report };
  } catch (cause) {
    if (timedOut) throw new Error("The scheduling service took too long. Your current plan is unchanged; try again.");
    if (controller.signal.aborted) throw cause;
    if (cause instanceof TypeError) throw new Error("Could not reach the scheduling service. Check your connection and try again.");
    throw cause;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
