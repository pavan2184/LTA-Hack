import { instanceDigest } from "../domain/instance";
import { literalWorld, type PlanningWorld } from "../domain/world";
import { digest } from "../engine/hash";
import { computeMetrics } from "../engine/metrics";
import { strategyProfiles, type StrategyProfile } from "../engine/strategies";
import { CONSTRAINT_VERSION, isFeasible, validate, type ValidationContext } from "../engine/validate";
import {
  priorityWeight,
  type DeferredRequest,
  type MaintenanceRequest,
  type Plan,
  type Placement,
  type SolveResult,
  type SolveStatus,
  type StrategyId,
  type Violation,
  type ViolationRuleId,
} from "../types/railplan";

export const SOLVER_VERSION = "railplan-greedy-repair-v2";

/** Backtracking rounds allowed when mandatory work cannot be placed. */
const MAX_REPAIR_ROUNDS = 4;

export interface SolveOptions {
  strategy: StrategyId;
  /** Placements the planner pinned. Entered as hard constraints before solving. */
  locked?: Placement[];
  context?: ValidationContext;
  /** Requests to plan. Defaults to the full set; used by what-if runs. */
  requests?: MaintenanceRequest[];
  /** Placements excluded from consideration, used to generate k-best alternatives. */
  excluded?: { requestId: string; startMinute: number }[];
}

/**
 * Deterministic priority-ordered earliest-feasible insertion with bounded
 * repair.
 *
 * This is a heuristic and is reported as one. It returns FEASIBLE, not OPTIMAL,
 * unless every request was placed at its first-choice slot — in which case no
 * better plan exists under this objective and OPTIMAL is honest. Every result
 * is handed back to `validate` before it is returned, so a plan that the solver
 * believes is fine but is not will surface as INFEASIBLE rather than ship.
 */
export function solve(options: SolveOptions): SolveResult {
  const started = now();
  const profile = strategyProfiles[options.strategy];
  const world = options.context?.world ?? literalWorld();
  const pool = options.requests ?? world.requests;
  // The world is carried on the context rather than passed alongside it, so
  // every downstream `validate` call is against the same night the solver
  // planned. A solver that builds against one set of facts and is checked
  // against another is not being checked.
  const context: ValidationContext = {
    ...options.context,
    world,
    windowEnd: options.context?.windowEnd ?? world.windowEnd,
  };
  const solveContext: ValidationContext = {
    ...context,
    windowEnd: Math.min(context.windowEnd ?? world.windowEnd, world.windowEnd - profile.windowReserveMinutes),
  };

  const excluded = new Set(
    (options.excluded ?? []).map((entry) => `${entry.requestId}@${entry.startMinute}`),
  );
  const lockedById = new Map((options.locked ?? []).map((placement) => [placement.requestId, placement]));

  let placements: Placement[] = [...lockedById.values()].map((placement) => ({ ...placement, locked: true }));
  let deferred: DeferredRequest[] = [];
  let candidatesEvaluated = 0;
  let firstChoiceEverywhere = true;

  const queue = orderQueue(
    pool.filter((request) => !lockedById.has(request.id)),
    profile,
  );

  const displaced = new Set<string>();

  for (let round = 0; round <= MAX_REPAIR_ROUNDS; round += 1) {
    placements = [...lockedById.values()].map((placement) => ({ ...placement, locked: true }));
    deferred = [];
    candidatesEvaluated = 0;
    firstChoiceEverywhere = true;

    for (const request of queue) {
      if (displaced.has(request.id)) {
        deferred.push({
          requestId: request.id,
          bindingRuleIds: [],
          reason: `Deferred so that mandatory work could be placed. ${request.priority} priority.`,
        });
        continue;
      }

      const attempt = place(request, placements, deferred, profile, solveContext, excluded);
      candidatesEvaluated += attempt.evaluated;

      if (attempt.placement) {
        placements.push(attempt.placement);
        if (attempt.rank > 0) firstChoiceEverywhere = false;
        continue;
      }

      firstChoiceEverywhere = false;
      deferred.push({
        requestId: request.id,
        bindingRuleIds: attempt.bindingRuleIds,
        reason: attempt.reason,
      });
    }

    const unplacedMandatory = deferred
      .map((entry) => world.requestById[entry.requestId])
      .filter((request) => request?.mandatory);

    if (!unplacedMandatory.length) break;
    if (round === MAX_REPAIR_ROUNDS) break;

    // Repair: give up the least valuable placed work that is standing in the way
    // of mandatory work, then re-solve from scratch so the result stays a
    // function of its inputs rather than of the order repairs happened in.
    const blockers = placements
      .map((placement) => world.requestById[placement.requestId])
      .filter((request) => request && !request.mandatory && !lockedById.has(request.id) && !displaced.has(request.id))
      .sort(
        (a, b) =>
          priorityWeight[a.priority] - priorityWeight[b.priority] ||
          b.durationMinutes - a.durationMinutes ||
          a.id.localeCompare(b.id),
      );

    if (!blockers.length) break;
    displaced.add(blockers[0].id);
  }

  const plan: Plan = {
    placements: placements.sort(
      (a, b) => a.startMinute - b.startMinute || a.requestId.localeCompare(b.requestId),
    ),
    deferred: deferred.sort((a, b) => a.requestId.localeCompare(b.requestId)),
  };

  // Independent re-validation of the finished plan, against the real window
  // rather than the strategy's tightened one.
  const violations = validate(plan, context);
  const feasible = isFeasible(violations);
  const mandatoryDeferred = plan.deferred.some((entry) => world.requestById[entry.requestId]?.mandatory);

  let status: SolveStatus;
  if (!feasible || mandatoryDeferred) status = "INFEASIBLE";
  else if (firstChoiceEverywhere && !plan.deferred.length) status = "OPTIMAL";
  else status = "FEASIBLE";

  const metrics = computeMetrics(plan, violations, pool, context);

  return {
    status,
    strategy: options.strategy,
    plan,
    violations,
    metrics,
    objective: buildObjective(profile, metrics),
    inputHash: digest({
      strategy: options.strategy,
      requests: pool.map((request) => request.id),
      locked: [...lockedById.values()].map((p) => `${p.requestId}@${p.startMinute}`).sort(),
      excluded: [...excluded].sort(),
      ...hashableContext(context, world),
      constraintVersion: CONSTRAINT_VERSION,
      solverVersion: SOLVER_VERSION,
    }),
    constraintVersion: CONSTRAINT_VERSION,
    solverVersion: SOLVER_VERSION,
    solveMs: Math.max(0, Math.round((now() - started) * 100) / 100),
    candidatesEvaluated,
    independentlyValidated: feasible,
  };
}

/**
 * The plan as requested: every job at the time its owner asked for.
 *
 * `overrides` are times a planner has since accepted for individual jobs — an
 * applied suggestion. They are part of the requested plan rather than a solver
 * output, which is what lets a planner fix conflicts one at a time and watch the
 * count fall before handing the night to the solver at all.
 */
export function buildSubmittedPlan(
  pool: MaintenanceRequest[] = literalWorld().requests,
  overrides: Record<string, number> = {},
): Plan {
  return {
    placements: pool
      .map((request) => {
        const start = overrides[request.id] ?? request.preferredStart;
        return {
          requestId: request.id,
          startMinute: start,
          endMinute: start + request.durationMinutes,
          teamId: request.teamId,
          locked: false,
        };
      })
      .sort((a, b) => a.startMinute - b.startMinute || a.requestId.localeCompare(b.requestId)),
    deferred: [],
  };
}

/** Validate and score the requested plan without solving anything. */
export function reviewSubmittedPlan(
  context: ValidationContext = {},
  overrides: Record<string, number> = {},
): SolveResult {
  const started = now();
  const world = context.world ?? literalWorld();
  const scoped: ValidationContext = { ...context, world };
  const plan = buildSubmittedPlan(world.requests, overrides);
  const violations = validate(plan, scoped);
  const metrics = computeMetrics(plan, violations, world.requests, scoped);
  return {
    status: isFeasible(violations) ? "FEASIBLE" : "INFEASIBLE",
    strategy: "submitted",
    plan,
    violations,
    metrics,
    objective: [],
    inputHash: digest({
      plan: "submitted",
      overrides: Object.entries(overrides)
        .map(([id, start]) => `${id}@${start}`)
        .sort(),
      ...hashableContext(context, world),
      constraintVersion: CONSTRAINT_VERSION,
    }),
    constraintVersion: CONSTRAINT_VERSION,
    solverVersion: SOLVER_VERSION,
    solveMs: Math.max(0, Math.round((now() - started) * 100) / 100),
    candidatesEvaluated: 0,
    independentlyValidated: isFeasible(violations),
  };
}

/**
 * Strategy order, corrected so a predecessor is always considered before the
 * work that depends on it.
 *
 * Without this the solver can place M-013 at a good slot, then discover M-007
 * has nowhere legal to go in front of it and defer a job that had a perfectly
 * good home. Sorting by value alone is not enough when the graph has edges.
 */
function orderQueue(pool: MaintenanceRequest[], profile: StrategyProfile): MaintenanceRequest[] {
  const ranked = [...pool].sort(
    (a, b) => profile.requestRank(a) - profile.requestRank(b) || a.id.localeCompare(b.id),
  );
  const inPool = new Set(ranked.map((request) => request.id));
  const emitted = new Set<string>();
  const ordered: MaintenanceRequest[] = [];
  const remaining = [...ranked];

  while (remaining.length) {
    const readyIndex = remaining.findIndex((request) =>
      request.dependencies.every((id) => !inPool.has(id) || emitted.has(id)),
    );
    // A cycle would leave nothing ready. Emit the highest-ranked remaining
    // request so the solve still terminates and the validator reports the cycle.
    const index = readyIndex === -1 ? 0 : readyIndex;
    const [next] = remaining.splice(index, 1);
    emitted.add(next.id);
    ordered.push(next);
  }

  return ordered;
}

// --- placement --------------------------------------------------------------

interface PlacementAttempt {
  placement: Placement | null;
  /** Index of the chosen candidate in the profile's preference order. */
  rank: number;
  evaluated: number;
  bindingRuleIds: ViolationRuleId[];
  reason: string;
}

function place(
  request: MaintenanceRequest,
  placed: Placement[],
  deferred: DeferredRequest[],
  profile: StrategyProfile,
  context: ValidationContext,
  excluded: Set<string>,
): PlacementAttempt {
  const world = context.world ?? literalWorld();
  const windowEnd = context.windowEnd ?? world.windowEnd;
  const latest = Math.min(request.latestEnd, windowEnd - request.clearanceMinutes) - request.durationMinutes;
  const candidates: number[] = [];
  for (
    let start = ceilToSlot(Math.max(request.earliestStart, 0), world.slotMinutes);
    start <= latest;
    start += world.slotMinutes
  ) {
    if (excluded.has(`${request.id}@${start}`)) continue;
    candidates.push(start);
  }

  candidates.sort(
    (a, b) => profile.candidateCost(request, a) - profile.candidateCost(request, b) || a - b,
  );

  const blocking = new Map<ViolationRuleId, number>();
  let evaluated = 0;

  // Two passes. The first insists on the strategy's recovery gap; the second
  // drops it. Profiles that treat the gap as the whole point skip pass two.
  const gaps =
    profile.extraBlockBufferMinutes > 0 && profile.relaxBufferWhenBlocked
      ? [profile.extraBlockBufferMinutes, 0]
      : [profile.extraBlockBufferMinutes];

  for (const gap of gaps) {
    for (let rank = 0; rank < candidates.length; rank += 1) {
      const start = candidates[rank];
      evaluated += 1;
      const placement: Placement = {
        requestId: request.id,
        startMinute: start,
        endMinute: start + request.durationMinutes,
        teamId: request.teamId,
        locked: false,
      };

      const trial: Plan = { placements: [...placed, placement], deferred };
      const violations = validate(trial, context).filter(
        (violation) => violation.severity === "critical" && violation.requestIds.includes(request.id),
      );

      if (violations.length) {
        violations.forEach((violation) =>
          blocking.set(violation.ruleId, (blocking.get(violation.ruleId) ?? 0) + 1),
        );
        continue;
      }

      // The strategy's extra separation is a preference, not a safety rule, so
      // it is applied here rather than in the validator.
      if (gap > 0 && !hasSeparation(placement, request, placed, gap, world)) continue;

      return { placement, rank, evaluated, bindingRuleIds: [], reason: "" };
    }
  }

  const ranked = [...blocking.entries()].sort((a, b) => b[1] - a[1]).map(([ruleId]) => ruleId);
  return {
    placement: null,
    rank: -1,
    evaluated,
    bindingRuleIds: ranked,
    reason: candidates.length
      ? `No feasible start in ${candidates.length} candidate slots. Blocked by ${ranked.slice(0, 2).join(" and ") || "the engineering window"}.`
      : "The permitted window is shorter than the work plus its clearance time.",
  };
}

/** Strategy-level recovery gap between this job and its neighbours on a block. */
function hasSeparation(
  placement: Placement,
  request: MaintenanceRequest,
  placed: Placement[],
  gap: number,
  world: PlanningWorld,
): boolean {
  const blocks = new Set(request.blockIds);
  const start = placement.startMinute;
  const end = placement.endMinute + request.clearanceMinutes;

  return placed.every((other) => {
    const otherRequest = world.requestById[other.requestId];
    if (!otherRequest) return true;
    if (!otherRequest.blockIds.some((id) => blocks.has(id))) return true;
    const otherStart = other.startMinute;
    const otherEnd = other.endMinute + otherRequest.clearanceMinutes;
    // Locked placements are the planner's decision; the profile does not get to
    // reject a slot for being too close to something the planner pinned.
    if (other.locked) return true;
    return otherStart >= end + gap || start >= otherEnd + gap;
  });
}

function buildObjective(profile: StrategyProfile, metrics: ReturnType<typeof computeMetrics>) {
  return [
    { label: "Weighted completion", value: metrics.weightedCompletion.value, unit: "%" },
    { label: "Critical placed", value: metrics.criticalPlaced.value, unit: "jobs" },
    { label: "Weighted movement", value: metrics.movement.value, unit: "min" },
    { label: "Emergency capacity", value: metrics.emergencyCapacity.value, unit: "%" },
    { label: "Minimum recovery gap held", value: profile.extraBlockBufferMinutes, unit: "min" },
  ];
}

/**
 * The parts of a context that can change a result, in a form that hashes.
 *
 * The world cannot go into the digest as it stands: it carries functions, and
 * serialising a whole instance on every solve would be slow and enormous. Its
 * content digest is the right substitute — it changes when and only when the
 * facts do, which makes `inputHash` a claim about *which night* was planned as
 * well as how. Two solves that agree on everything except the topology they
 * were given must not report the same hash.
 */
function hashableContext(context: ValidationContext, world: PlanningWorld) {
  // The world is dropped here and represented by its digest instead.
  const rest: ValidationContext = { ...context };
  delete rest.world;
  return { context: rest, instance: instanceDigest(world.instance) };
}

function ceilToSlot(minutes: number, slot: number): number {
  return Math.ceil(minutes / slot) * slot;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export type { Violation };
