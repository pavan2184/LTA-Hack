import { requestById, SLOT_MINUTES, WINDOW_END } from "@/data/requests";
import { categoryOf, categoryProfile } from "@/engine/conflicts";
import { formatClock } from "@/engine/intervals";
import { validate, type ValidationContext } from "@/engine/validate";
import { priorityWeight, type Plan, type Violation } from "@/types/railplan";

/**
 * Suggested fixes for a named conflict.
 *
 * The rule for everything in this file: a suggestion is only offered after it
 * has been *tried*. Each candidate start is inserted into the real plan and put
 * to the validator, and the move is offered only if the named conflict is gone
 * and the plan is no worse overall. Nothing here reasons about what "should"
 * work.
 */

export interface Resolution {
  /** Key of the conflict this fixes, stable across re-validation. */
  conflictKey: string;
  /** The request that moves. Chosen as the cheapest thing to disturb. */
  requestId: string;
  fromMinute: number;
  toMinute: number;
  endMinute: number;
  /** Minutes between the current placement and the proposed one. */
  movementMinutes: number;
  /** Distance from the time the requester originally asked for. */
  movementFromRequested: number;
  /** Conflicts this move clears, the named one included. */
  clears: string[];
  /** Conflicts this move would introduce. Empty in anything we recommend. */
  creates: string[];
  /** Requests that end up newly conflicted by the move. Empty = nobody else. */
  affectedRequestIds: string[];
  headline: string;
  impact: string;
}

/** Identity of a conflict that survives re-validation, unlike its display id. */
export function conflictKey(violation: Violation): string {
  return `${violation.ruleId}|${[...violation.requestIds].sort().join(",")}`;
}

function criticalKeys(violations: Violation[]): Set<string> {
  return new Set(
    violations.filter((violation) => violation.severity === "critical").map(conflictKey),
  );
}

/**
 * The cheapest request to move out of a conflict.
 *
 * Mandatory work goes last, then low priority before high, then short jobs
 * before long ones. A planner disturbs the least valuable thing on the board,
 * and so does this.
 */
function moveOrder(requestIds: string[]): string[] {
  return [...requestIds].sort((a, b) => {
    const left = requestById[a];
    const right = requestById[b];
    if (!left || !right) return a.localeCompare(b);
    return (
      Number(left.mandatory) - Number(right.mandatory) ||
      priorityWeight[left.priority] - priorityWeight[right.priority] ||
      left.durationMinutes - right.durationMinutes ||
      a.localeCompare(b)
    );
  });
}

/**
 * Find the move that clears one conflict.
 *
 * Returns null when no start time for any request named in the conflict clears
 * it without making the plan worse — which is a real answer, and is reported as
 * "no single move fixes this" rather than papered over.
 */
export function recommendResolution(
  plan: Plan,
  violation: Violation,
  context: ValidationContext = {},
): Resolution | null {
  const windowEnd = context.windowEnd ?? WINDOW_END;
  const baseline = validate(plan, context);
  const baselineKeys = criticalKeys(baseline);
  const target = conflictKey(violation);
  if (!baselineKeys.has(target)) return null;

  let best: Resolution | null = null;

  for (const requestId of moveOrder(violation.requestIds)) {
    const request = requestById[requestId];
    if (!request) continue;

    const current = plan.placements.find((placement) => placement.requestId === requestId);
    if (!current) continue;

    const others = plan.placements.filter((placement) => placement.requestId !== requestId);
    const latest =
      Math.min(request.latestEnd, windowEnd - request.clearanceMinutes) - request.durationMinutes;

    for (let start = request.earliestStart; start <= latest; start += SLOT_MINUTES) {
      if (start === current.startMinute) continue;

      const trial: Plan = {
        placements: [
          ...others,
          {
            requestId,
            startMinute: start,
            endMinute: start + request.durationMinutes,
            teamId: request.teamId,
            locked: current.locked,
          },
        ],
        deferred: plan.deferred,
      };

      const trialKeys = criticalKeys(validate(trial, context));
      if (trialKeys.has(target)) continue;
      // A fix that trades one conflict for another is not a fix.
      if (trialKeys.size >= baselineKeys.size) continue;

      const creates = [...trialKeys].filter((key) => !baselineKeys.has(key));
      const clears = [...baselineKeys].filter((key) => !trialKeys.has(key));
      const movement = Math.abs(start - current.startMinute);

      const candidate: Resolution = {
        conflictKey: target,
        requestId,
        fromMinute: current.startMinute,
        toMinute: start,
        endMinute: start + request.durationMinutes,
        movementMinutes: movement,
        movementFromRequested: Math.abs(start - request.preferredStart),
        clears,
        creates,
        affectedRequestIds: [
          ...new Set(creates.flatMap((key) => key.split("|")[1].split(",")).filter((id) => id !== requestId)),
        ].sort(),
        headline: `Move ${requestId} to ${formatClock(start)}`,
        impact: describeImpact(movement, start, current.startMinute, clears.length, creates.length),
      };

      if (isBetter(candidate, best)) best = candidate;
    }
  }

  return best;
}

/**
 * Ranking between two candidate fixes.
 *
 * Clean fixes beat fixes that create something new; then the one that clears
 * more; then the one that disturbs the schedule least.
 */
function isBetter(candidate: Resolution, incumbent: Resolution | null): boolean {
  if (!incumbent) return true;
  if (candidate.creates.length !== incumbent.creates.length) {
    return candidate.creates.length < incumbent.creates.length;
  }
  if (candidate.clears.length !== incumbent.clears.length) {
    return candidate.clears.length > incumbent.clears.length;
  }
  if (candidate.movementMinutes !== incumbent.movementMinutes) {
    return candidate.movementMinutes < incumbent.movementMinutes;
  }
  return candidate.movementFromRequested < incumbent.movementFromRequested;
}

function describeImpact(
  movement: number,
  to: number,
  from: number,
  cleared: number,
  created: number,
): string {
  const direction = to > from ? "delay" : "advance";
  const parts = [`${movement}-minute ${direction}`];
  parts.push(cleared > 1 ? `clears ${cleared} conflicts` : "clears 1 conflict");
  parts.push(created ? `introduces ${created} new conflict${created === 1 ? "" : "s"}` : "no other requests affected");
  return parts.join(" · ");
}

export interface RepairOutcome {
  /** Start minute each moved request ends up at. */
  moves: Resolution[];
  /** Conflicts left once every offered move has been applied. */
  remaining: Violation[];
  /** Conflicts before any move was applied. */
  before: number;
}

/**
 * Apply the recommended fix to the worst conflict, then look again.
 *
 * Greedy and bounded, and it says so. It re-validates after every single move
 * rather than assuming the earlier recommendations still hold, so it cannot
 * report a plan the constraints have not seen. It stops when nothing is left,
 * or when the worst remaining conflict has no single move that fixes it.
 */
export function repairPlan(
  plan: Plan,
  context: ValidationContext = {},
  maxMoves = 24,
): RepairOutcome {
  let working: Plan = { placements: [...plan.placements], deferred: plan.deferred };
  const moves: Resolution[] = [];
  const before = validate(working, context).filter((v) => v.severity === "critical").length;
  const stuck = new Set<string>();

  for (let round = 0; round < maxMoves; round += 1) {
    const violations = validate(working, context)
      .filter((violation) => violation.severity === "critical")
      .filter((violation) => !stuck.has(conflictKey(violation)))
      .sort((a, b) => b.shortfallMinutes - a.shortfallMinutes || conflictKey(a).localeCompare(conflictKey(b)));

    if (!violations.length) break;

    const target = violations[0];
    const resolution = recommendResolution(working, target, context);
    if (!resolution) {
      stuck.add(conflictKey(target));
      continue;
    }

    working = {
      placements: working.placements.map((placement) =>
        placement.requestId === resolution.requestId
          ? {
              ...placement,
              startMinute: resolution.toMinute,
              endMinute: resolution.endMinute,
            }
          : placement,
      ),
      deferred: working.deferred,
    };
    moves.push(resolution);
  }

  return {
    moves,
    remaining: validate(working, context).filter((violation) => violation.severity === "critical"),
    before,
  };
}

/** Human label for the kind of conflict a resolution clears. */
export function categoryLabelFor(violation: Violation): string {
  return categoryProfile[categoryOf(violation.ruleId)].label;
}
