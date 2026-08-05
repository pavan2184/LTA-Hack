import { literalWorld } from "../domain/world";
import { formatClock } from "../engine/intervals";
import { validate, type ValidationContext } from "../engine/validate";
import type { Plan, Violation } from "../types/railplan";

/**
 * Why a job ended up where it did.
 *
 * The answer is produced by counterfactual: put the job back at the time its
 * requester asked for, hold everything else still, and run the validator. What
 * breaks is the reason. Nothing here is authored prose about a specific job —
 * the sentence is assembled from whatever the rules actually reported.
 */
export interface PlacementExplanation {
  requestId: string;
  requestedStart: number;
  placedStart: number | null;
  movedMinutes: number;
  /** Violations that would occur at the requested time. Empty if none. */
  blockers: Violation[];
  /** Ordered, human-readable facts backing the summary sentence. */
  facts: { label: string; value: string }[];
  summary: string;
}

export function explainPlacement(
  plan: Plan,
  requestId: string,
  context: ValidationContext = {},
): PlacementExplanation | null {
  const world = context.world ?? literalWorld();
  const request = world.requestById[requestId];
  if (!request) return null;

  const placement = plan.placements.find((item) => item.requestId === requestId);
  const others = plan.placements.filter((item) => item.requestId !== requestId);
  const team = world.teamById[request.teamId];

  const counterfactual: Plan = {
    placements: [
      ...others,
      {
        requestId,
        startMinute: request.preferredStart,
        endMinute: request.preferredStart + request.durationMinutes,
        teamId: request.teamId,
        locked: false,
      },
    ],
    deferred: plan.deferred.filter((entry) => entry.requestId !== requestId),
  };

  const blockers = validate(counterfactual, context).filter(
    (violation) => violation.severity === "critical" && violation.requestIds.includes(requestId),
  );

  const movedMinutes = placement ? placement.startMinute - request.preferredStart : 0;

  const facts: { label: string; value: string }[] = [
    { label: "Requested", value: `${formatClock(request.preferredStart)}-${formatClock(request.preferredStart + request.durationMinutes)}` },
    {
      label: "Planned",
      value: placement
        ? `${formatClock(placement.startMinute)}-${formatClock(placement.endMinute)}`
        : "Not placed",
    },
    { label: "Track blocks", value: request.blockIds.join(", ") },
    { label: "Crew", value: team ? `${team.name} (${team.capacity} crew)` : request.teamId },
    {
      label: "Equipment",
      value: request.equipment.map((item) => `${item.units} x ${item.equipmentId}`).join(", "),
    },
  ];

  if (request.clearanceMinutes) {
    facts.push({ label: "Clearance after work", value: `${request.clearanceMinutes} min` });
  }
  if (request.dependencies.length) {
    facts.push({
      label: "Waits for",
      value: `${request.dependencies.join(", ")} plus ${request.dependencyLagMinutes} min`,
    });
  }

  return {
    requestId,
    requestedStart: request.preferredStart,
    placedStart: placement?.startMinute ?? null,
    movedMinutes,
    blockers,
    facts,
    summary: buildSummary(requestId, placement?.startMinute ?? null, request.preferredStart, blockers),
  };
}

function buildSummary(
  requestId: string,
  placedStart: number | null,
  requestedStart: number,
  blockers: Violation[],
): string {
  if (placedStart === null) {
    if (!blockers.length) {
      return `${requestId} has no start time in this plan. No rule blocks its requested slot, so it was displaced to make room for mandatory work.`;
    }
    return `${requestId} could not be placed. At its requested ${formatClock(requestedStart)} start, ${describe(blockers, requestId)}`;
  }

  if (placedStart === requestedStart) {
    return `${requestId} is at ${formatClock(requestedStart)}, exactly as requested. No constraint required it to move.`;
  }

  const direction = placedStart > requestedStart ? "later" : "earlier";
  const delta = Math.abs(placedStart - requestedStart);

  if (!blockers.length) {
    return `${requestId} moved ${delta} minutes ${direction}, to ${formatClock(placedStart)}. Its requested slot is feasible on its own; the planning objective preferred this one.`;
  }

  return `${requestId} moved from ${formatClock(requestedStart)} to ${formatClock(placedStart)}, ${delta} minutes ${direction}, because ${describe(blockers, requestId)}`;
}

/** Turn violation records into one clause per rule, using their own numbers. */
function describe(blockers: Violation[], subjectId: string): string {
  const clauses = blockers.slice(0, 3).map((violation) => {
    // The subject is the thing being explained; naming it as its own conflict
    // partner reads as nonsense ("clashes with M-008 and M-014" for M-014).
    const others = violation.requestIds.filter((id) => id !== subjectId);
    const partners = others.length ? others.join(" and ") : "other work";
    switch (violation.ruleId) {
      case "BLOCK_CAPACITY":
        return `it would occupy ${violation.subjects.join(", ")} at the same time as ${partners} for ${violation.shortfallMinutes} minutes`;
      case "TEAM_CAPACITY":
        return `${violation.subjects[0]} would be committed to ${partners} simultaneously for ${violation.shortfallMinutes} minutes`;
      case "EQUIPMENT_CAPACITY":
        return `the ${violation.subjects[0]} would be needed in two places for ${violation.shortfallMinutes} minutes`;
      case "CONFLICT_ZONE":
        return `${violation.subjects[1] ?? violation.subjects[0]} would be held by two jobs for ${violation.shortfallMinutes} minutes`;
      case "ADJACENT_WORK":
        return `it would run within one block of ${partners} for ${violation.shortfallMinutes} minutes, which those work types do not permit`;
      case "DEPENDENCY_ORDER":
        return `it would start ${violation.shortfallMinutes} minutes before its predecessor is handed back`;
      case "TRAVEL_TIME":
        return `the crew could not travel from its previous job in time, short by ${violation.shortfallMinutes} minutes`;
      case "HANDBACK":
        return `the work plus its clearance would run ${violation.shortfallMinutes} minutes past handback`;
      case "TIME_WINDOW":
        return `the slot falls outside the permitted window by ${violation.shortfallMinutes} minutes`;
      default:
        return violation.detail;
    }
  });

  if (clauses.length === 1) return `${clauses[0]}.`;
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}.`;
}

/**
 * Why a request was left out, using the binding rules the solver recorded and
 * the counterfactual check above.
 */
export function explainDeferral(
  plan: Plan,
  requestId: string,
  context: ValidationContext = {},
): string {
  const entry = plan.deferred.find((item) => item.requestId === requestId);
  const explanation = explainPlacement(plan, requestId, context);
  if (!entry) return explanation?.summary ?? "";
  if (entry.bindingRuleIds.length) {
    return `${entry.reason} ${explanation?.summary ?? ""}`.trim();
  }
  return entry.reason;
}
