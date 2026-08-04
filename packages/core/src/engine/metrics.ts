import { emergencyScenarios, EMERGENCY_SET_VERSION } from "../data/emergencyScenarios";
import { requestById, SLOT_MINUTES, WINDOW_END, WINDOW_START } from "../data/requests";
import { trackBlocks } from "../domain/network";
import { equipmentTypes, teams } from "../domain/resources";
import { isFeasible, validate, type ValidationContext } from "../engine/validate";
import {
  priorityWeight,
  type MaintenanceRequest,
  type MetricValue,
  type Plan,
  type PlanMetrics,
  type Violation,
} from "../types/railplan";

export const METRIC_VERSION = "metrics-v3";

/** Recovery gap a planner expects between consecutive jobs on the same block. */
const TARGET_RECOVERY_GAP = 15;
/** Alternative starts counted per job before flexibility saturates. */
const FLEXIBILITY_CAP = 4;
/**
 * Planner minutes assumed to reconcile one conflict by hand: pull both requests,
 * check the sector, the roster and the asset, agree a new time with the
 * requester, re-check what that broke.
 *
 * This is an ASSUMPTION, not a measurement, and it is the only one on the
 * dashboard. It is declared here as a single named constant so the figure it
 * feeds can state it, and so a planner who thinks twelve minutes is wrong can
 * see exactly which number to argue with.
 */
export const ASSUMED_MINUTES_PER_MANUAL_CONFLICT = 12;

function metric(
  key: string,
  label: string,
  value: number,
  unit: MetricValue["unit"],
  numerator: number,
  denominator: number,
  formula: string,
  note: string,
): MetricValue {
  return { key, label, value, unit, numerator, denominator, formula, note };
}

/**
 * Every headline number the interface shows, computed from the plan.
 *
 * Each value carries its own formula, numerator and denominator so it can be
 * inspected rather than trusted. Nothing here reads a stored score.
 */
export function computeMetrics(
  plan: Plan,
  violations: Violation[],
  pool: MaintenanceRequest[],
  context: ValidationContext = {},
): PlanMetrics {
  const windowEnd = context.windowEnd ?? WINDOW_END;
  const windowLength = windowEnd - WINDOW_START;
  const placedIds = new Set(plan.placements.map((p) => p.requestId));
  const placedRequests = pool.filter((request) => placedIds.has(request.id));

  const totalWeight = pool.reduce((sum, request) => sum + priorityWeight[request.priority], 0);
  const placedWeight = placedRequests.reduce((sum, request) => sum + priorityWeight[request.priority], 0);

  const criticalTotal = pool.filter((request) => request.mandatory).length;
  const criticalPlaced = placedRequests.filter((request) => request.mandatory).length;

  const conflictedIds = new Set(
    violations.filter((v) => v.severity === "critical").flatMap((v) => v.requestIds),
  );

  // --- utilisation ---------------------------------------------------------
  const blockMinutesUsed = plan.placements.reduce((sum, placement) => {
    const request = requestById[placement.requestId];
    if (!request) return sum;
    const occupancy = placement.endMinute - placement.startMinute + request.clearanceMinutes;
    return sum + occupancy * request.blockIds.length;
  }, 0);
  const blockMinutesAvailable = trackBlocks.length * windowLength;

  const teamMinutesUsed = plan.placements.reduce(
    (sum, placement) => sum + (placement.endMinute - placement.startMinute),
    0,
  );
  const teamMinutesAvailable = teams.reduce(
    (sum, team) => sum + team.capacity * (Math.min(team.shiftEnd, windowEnd) - team.shiftStart),
    0,
  );

  const equipmentMinutesUsed = plan.placements.reduce((sum, placement) => {
    const request = requestById[placement.requestId];
    if (!request) return sum;
    return (
      sum +
      request.equipment.reduce((inner, demand) => {
        const type = equipmentTypes.find((item) => item.id === demand.equipmentId);
        const turnaround = type?.turnaroundMinutes ?? 0;
        return inner + (placement.endMinute - placement.startMinute + turnaround) * demand.units;
      }, 0)
    );
  }, 0);
  const equipmentMinutesAvailable = equipmentTypes.reduce(
    (sum, type) => sum + type.units * windowLength,
    0,
  );

  // --- buffers -------------------------------------------------------------
  const buffer = bufferCompliance(plan);
  const emergency = emergencyInsertability(plan, context);
  const flex = flexibility(plan, context);
  const movement = movementMinutes(plan);

  return {
    placed: metric(
      "placed",
      "Requests scheduled",
      plan.placements.length,
      "count",
      plan.placements.length,
      pool.length,
      "placements / total requests",
      "Counts jobs with a start time in this plan.",
    ),
    weightedCompletion: metric(
      "weightedCompletion",
      "Weighted completion",
      pct(placedWeight, totalWeight),
      "percent",
      placedWeight,
      totalWeight,
      "Σ weight(placed) / Σ weight(all), weights critical 8 / high 4 / medium 2 / low 1",
      "Stops a plan full of short low-priority jobs from outscoring one that protects critical work.",
    ),
    criticalPlaced: metric(
      "criticalPlaced",
      "Mandatory work placed",
      criticalPlaced,
      "count",
      criticalPlaced,
      criticalTotal,
      "critical requests placed / critical requests submitted",
      "Critical requests are mandatory; a plan that defers one is reported infeasible.",
    ),
    violations: metric(
      "violations",
      "Unresolved conflicts",
      violations.filter((v) => v.severity === "critical").length,
      "count",
      violations.filter((v) => v.severity === "critical").length,
      violations.length,
      "critical violations found by the validator / all violations",
      "Derived by re-running every rule against this plan, not carried from anywhere.",
    ),
    conflictedRequests: metric(
      "conflictedRequests",
      "Conflicting requests",
      conflictedIds.size,
      "count",
      conflictedIds.size,
      pool.length,
      "distinct requests named in at least one critical violation / total requests",
      "One request can be in several conflicts; this counts requests, not findings.",
    ),
    blockUtilisation: metric(
      "blockUtilisation",
      "Engineering-hours used",
      pct(blockMinutesUsed, blockMinutesAvailable),
      "percent",
      blockMinutesUsed,
      blockMinutesAvailable,
      "Σ (duration + clearance) × blocks occupied / (12 blocks × window minutes)",
      "Occupied block-minutes as a share of the block-minutes the window offers.",
    ),
    teamUtilisation: metric(
      "teamUtilisation",
      "Engineer utilisation",
      pct(teamMinutesUsed, teamMinutesAvailable),
      "percent",
      teamMinutesUsed,
      teamMinutesAvailable,
      "Σ job duration / Σ (crews × shift minutes)",
      "Reported separately from block and equipment use; the three are not interchangeable.",
    ),
    equipmentUtilisation: metric(
      "equipmentUtilisation",
      "Equipment use",
      pct(equipmentMinutesUsed, equipmentMinutesAvailable),
      "percent",
      equipmentMinutesUsed,
      equipmentMinutesAvailable,
      "Σ (duration + turnaround) × units / Σ (units × window minutes)",
      "Includes the time an asset is committed to moving between jobs.",
    ),
    bufferCompliance: metric(
      "bufferCompliance",
      "Recovery gap held",
      buffer.pairs ? pct(buffer.score, buffer.pairs) : 100,
      "percent",
      Math.round(buffer.score * 100) / 100,
      buffer.pairs,
      `mean over consecutive same-block pairs of min(1, gap / ${TARGET_RECOVERY_GAP} min)`,
      `Measures how much of the ${TARGET_RECOVERY_GAP}-minute target gap between jobs on a block survives.`,
    ),
    emergencyCapacity: metric(
      "emergencyCapacity",
      "Emergency capacity",
      pct(emergency.insertable, emergency.total),
      "percent",
      emergency.insertable,
      emergency.total,
      `scenarios insertable without displacing mandatory work / ${EMERGENCY_SET_VERSION}`,
      `Each of the ${emergency.total} scenarios was actually inserted and re-validated. Fitting: ${emergency.fitting.join(", ") || "none"}.`,
    ),
    flexibility: metric(
      "flexibility",
      "Rescheduling headroom",
      pct(flex.total, flex.max),
      "percent",
      flex.total,
      flex.max,
      `Σ min(feasible alternative starts, ${FLEXIBILITY_CAP}) / (placed jobs × ${FLEXIBILITY_CAP})`,
      "An alternative counts only after the validator confirms it, at 30-minute sampling.",
    ),
    movement: metric(
      "movement",
      "Movement from requested",
      movement.minutes,
      "minutes",
      movement.minutes,
      movement.moved,
      "Σ |placed start − requested start| over jobs that moved",
      `${movement.moved} of ${plan.placements.length} placed jobs moved. Weighted movement: ${movement.weighted} minutes.`,
    ),
  };
}

/**
 * Planner time saved, stated as the assumption it is.
 *
 * Every other figure on this dashboard is arithmetic over the plan. This one is
 * not: nobody timed a planner reconciling a conflict by hand, so the per-conflict
 * cost is an assumed constant. It is offered because "22 conflicts gone" does
 * not tell an operations manager what that is worth — but it is labelled
 * "estimated", its formula names the assumption, and the assumption is a single
 * editable constant rather than a number buried in a sentence.
 *
 * It is deliberately built here rather than inside `computeMetrics`, because it
 * needs a *baseline* — how many conflicts there were before — which a plan on
 * its own does not know.
 */
export function plannerTimeSavedMetric(
  conflictsBefore: number,
  conflictsAfter: number,
): MetricValue {
  const resolved = Math.max(0, conflictsBefore - conflictsAfter);
  const minutes = resolved * ASSUMED_MINUTES_PER_MANUAL_CONFLICT;
  return metric(
    "plannerTimeSaved",
    "Planner time saved",
    Math.round((minutes / 60) * 10) / 10,
    "count",
    minutes,
    60,
    `${resolved} conflicts resolved × ${ASSUMED_MINUTES_PER_MANUAL_CONFLICT} min assumed manual reconciliation, in hours`,
    `ESTIMATE. The ${ASSUMED_MINUTES_PER_MANUAL_CONFLICT}-minute figure is an assumption, not a measurement — it is the only assumed number on this dashboard. The conflict counts either side of it are computed.`,
  );
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function bufferCompliance(plan: Plan): { score: number; pairs: number } {
  const byBlock = new Map<string, { start: number; end: number }[]>();
  plan.placements.forEach((placement) => {
    const request = requestById[placement.requestId];
    if (!request) return;
    request.blockIds.forEach((blockId) => {
      if (!byBlock.has(blockId)) byBlock.set(blockId, []);
      byBlock.get(blockId)!.push({
        start: placement.startMinute,
        end: placement.endMinute + request.clearanceMinutes,
      });
    });
  });

  let score = 0;
  let pairs = 0;
  byBlock.forEach((intervals) => {
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const gap = sorted[index + 1].start - sorted[index].end;
      score += Math.min(1, Math.max(0, gap) / TARGET_RECOVERY_GAP);
      pairs += 1;
    }
  });

  return { score, pairs };
}

/**
 * Emergency capacity, computed by trying it.
 *
 * For each scenario in the versioned set, walk every 15-minute start and ask
 * the validator whether the emergency job fits alongside the plan without
 * displacing anything. A scenario counts only if a slot actually validates.
 */
function emergencyInsertability(
  plan: Plan,
  context: ValidationContext,
): { insertable: number; total: number; fitting: string[] } {
  const windowEnd = context.windowEnd ?? WINDOW_END;
  const fitting: string[] = [];

  emergencyScenarios.forEach((scenario) => {
    const synthetic: MaintenanceRequest = {
      id: scenario.id,
      title: scenario.label,
      shortTitle: scenario.label,
      workType: "Emergency response",
      workClass: "track-possession",
      blockIds: scenario.blockIds,
      sector: scenario.blockIds.join(","),
      durationMinutes: scenario.durationMinutes,
      clearanceMinutes: 0,
      priority: "critical",
      teamId: scenario.teamId,
      requiredSkills: ["emergency"],
      equipment: [{ equipmentId: scenario.equipmentId, units: 1 }],
      preferredStart: scenario.earliestStart,
      earliestStart: scenario.earliestStart,
      latestEnd: windowEnd,
      mandatory: true,
      dependencies: [],
      dependencyLagMinutes: 0,
      description: scenario.label,
    };

    const scenarioContext: ValidationContext = {
      ...context,
      extraRequests: { ...context.extraRequests, [scenario.id]: synthetic },
    };

    for (
      let start = scenario.earliestStart;
      start + scenario.durationMinutes <= windowEnd;
      start += SLOT_MINUTES
    ) {
      const trial: Plan = {
        placements: [
          ...plan.placements,
          {
            requestId: scenario.id,
            startMinute: start,
            endMinute: start + scenario.durationMinutes,
            teamId: scenario.teamId,
            locked: false,
          },
        ],
        deferred: plan.deferred,
      };
      if (isFeasible(validate(trial, scenarioContext))) {
        fitting.push(scenario.id);
        return;
      }
    }
  });

  return { insertable: fitting.length, total: emergencyScenarios.length, fitting };
}

/**
 * Rescheduling headroom: how many other slots each placed job could move to
 * with the rest of the plan held still. Sampled at 30 minutes to keep the
 * computation inside a single frame.
 */
function flexibility(plan: Plan, context: ValidationContext): { total: number; max: number } {
  const windowEnd = context.windowEnd ?? WINDOW_END;
  let total = 0;

  plan.placements.forEach((placement) => {
    const request = requestById[placement.requestId];
    if (!request) return;
    const others = plan.placements.filter((item) => item.requestId !== placement.requestId);
    let count = 0;

    for (
      let start = request.earliestStart;
      start + request.durationMinutes + request.clearanceMinutes <= Math.min(request.latestEnd, windowEnd);
      start += SLOT_MINUTES * 2
    ) {
      if (Math.abs(start - placement.startMinute) < 30) continue;
      if (count >= FLEXIBILITY_CAP) break;
      const trial: Plan = {
        placements: [
          ...others,
          { ...placement, startMinute: start, endMinute: start + request.durationMinutes },
        ],
        deferred: plan.deferred,
      };
      if (isFeasible(validate(trial, context))) count += 1;
    }

    total += Math.min(count, FLEXIBILITY_CAP);
  });

  return { total, max: plan.placements.length * FLEXIBILITY_CAP };
}

function movementMinutes(plan: Plan): { minutes: number; weighted: number; moved: number } {
  let minutes = 0;
  let weighted = 0;
  let moved = 0;
  plan.placements.forEach((placement) => {
    const request = requestById[placement.requestId];
    if (!request) return;
    const delta = Math.abs(placement.startMinute - request.preferredStart);
    if (!delta) return;
    minutes += delta;
    weighted += delta * priorityWeight[request.priority];
    moved += 1;
  });
  return { minutes, weighted, moved };
}
