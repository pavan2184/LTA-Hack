import { PLANNING_NIGHT, requestById, requests, SLOT_MINUTES, WINDOW_END } from "@/data/requests";
import { conflictZones, trackBlocks } from "@/domain/network";
import { equipmentTypes, teamById, teams } from "@/domain/resources";
import { explainPlacement } from "@/engine/explain";
import { formatClock } from "@/engine/intervals";
import { solve } from "@/engine/solve";
import { strategyList } from "@/engine/strategies";
import { ruleCatalogue } from "@/engine/validate";
import type { SolveResult } from "@/types/railplan";

/**
 * The fact set is the assistant's entire world.
 *
 * Everything the model is allowed to say has to be derivable from this object.
 * It is serialised into the prompt verbatim and then reused as the allow-list
 * that the grounding check runs against, so the two can never drift apart: if a
 * number is not in here, the model saying it is a bug we can detect.
 */
export interface FactSet {
  text: string;
  /** Numeric tokens the model may use. Anything else is treated as invented. */
  allowedNumbers: Set<string>;
}

export function buildFactSet(result: SolveResult, view: "submitted" | "planned"): FactSet {
  const lines: string[] = [];
  const push = (line: string) => lines.push(line);

  push(`# Planning context`);
  push(`Planning night: ${PLANNING_NIGHT}`);
  push(`Engineering window: 00:00 to ${formatClock(WINDOW_END)}`);
  push(`Planning resolution: ${SLOT_MINUTES} minutes`);
  push(`Network: ${trackBlocks.length} atomic track blocks across 3 lines`);
  push(`Currently shown: ${view === "submitted" ? "the plan as submitted by requesters" : "the plan produced by the solver"}`);
  push("");

  push(`# Solver run`);
  push(`Status: ${result.status}`);
  push(`Strategy: ${result.strategy}`);
  push(`Solver version: ${result.solverVersion}`);
  push(`Constraint set version: ${result.constraintVersion}`);
  push(`Solve time: ${result.solveMs} ms`);
  push(`Candidate start times evaluated: ${result.candidatesEvaluated}`);
  push(`Input hash: ${result.inputHash}`);
  push(`Independently re-validated after solving: ${result.independentlyValidated ? "yes, 0 critical violations" : "no, violations remain"}`);
  push("");

  push(`# Computed metrics`);
  Object.values(result.metrics).forEach((metric) => {
    push(
      `${metric.label}: ${metric.value}${metric.unit === "percent" ? "%" : metric.unit === "minutes" ? " min" : ""} ` +
        `(numerator ${metric.numerator}, denominator ${metric.denominator}; formula: ${metric.formula}). ${metric.note}`,
    );
  });
  push("");

  push(`# Violations found by the validator (${result.violations.length} total)`);
  if (!result.violations.length) push("None. Every hard constraint is satisfied.");
  result.violations.forEach((violation) => {
    push(
      `${violation.id} | rule ${violation.ruleId} (${ruleCatalogue[violation.ruleId].label}) | ` +
        `requests ${violation.requestIds.join(", ")} | observed ${violation.observed} | required ${violation.required} | ` +
        `shortfall ${violation.shortfallMinutes} min | ${violation.detail} | remedy: ${violation.remedy}`,
    );
  });
  push("");

  push(`# Placements`);
  result.plan.placements.forEach((placement) => {
    const request = requestById[placement.requestId];
    if (!request) return;
    const moved = placement.startMinute - request.preferredStart;
    push(
      `${placement.requestId} "${request.title}" | ${request.priority} | ${teamById[placement.teamId]?.name ?? placement.teamId} | ` +
        `blocks ${request.blockIds.join(" ")} | requested ${formatClock(request.preferredStart)} | ` +
        `planned ${formatClock(placement.startMinute)}-${formatClock(placement.endMinute)} | ` +
        `moved ${moved === 0 ? "0" : `${Math.abs(moved)} min ${moved > 0 ? "later" : "earlier"}`} | ` +
        `${placement.locked ? "pinned by planner" : "solver placed"}`,
    );
  });
  push("");

  push(`# Not placed (${result.plan.deferred.length})`);
  if (!result.plan.deferred.length) push("None.");
  result.plan.deferred.forEach((entry) => {
    const request = requestById[entry.requestId];
    push(
      `${entry.requestId} "${request?.title ?? ""}" | ${request?.priority ?? ""} | ` +
        `binding rules: ${entry.bindingRuleIds.join(", ") || "none recorded"} | ${entry.reason}`,
    );
  });
  push("");

  // Why each job sits where it does, including the rules that would fire at the
  // time its requester asked for. "Why did X move?" is the question planners
  // actually ask, and the answer lives in a counterfactual rather than in the
  // plan itself — so it has to be a fact, not something the model reconstructs.
  push(`# Why each job is where it is`);
  [...result.plan.placements.map((p) => p.requestId), ...result.plan.deferred.map((d) => d.requestId)]
    .sort()
    .forEach((requestId) => {
      const explanation = explainPlacement(result.plan, requestId);
      if (!explanation) return;
      push(`${requestId}: ${explanation.summary}`);
      explanation.blockers.forEach((violation) =>
        push(
          `  at its requested time this would breach ${violation.ruleId} with ${violation.requestIds.join(", ")}: ` +
            `observed ${violation.observed}, required ${violation.required}, shortfall ${violation.shortfallMinutes} min`,
        ),
      );
    });
  push("");

  push(`# Resource capacities`);
  teams.forEach((team) => push(`Team ${team.name}: ${team.capacity} crew, skills ${team.skills.join("/")}`));
  equipmentTypes.forEach((item) =>
    push(`Equipment ${item.name}: ${item.units} unit(s), ${item.turnaroundMinutes} min turnaround`),
  );
  conflictZones.forEach((zone) =>
    push(`Conflict zone ${zone.id} ${zone.name}: blocks ${zone.blockIds.join(" ")}. ${zone.reason}`),
  );
  push("");

  push(`# Rules the validator enforces`);
  Object.entries(ruleCatalogue).forEach(([id, rule]) => push(`${id}: ${rule.label}. ${rule.description}`));
  push("");

  push(`# Strategy comparison (each solved independently just now)`);
  push(comparisonTable());
  push("");

  push(`# Requests not currently discussed above`);
  requests
    .filter(
      (request) =>
        !result.plan.placements.some((p) => p.requestId === request.id) &&
        !result.plan.deferred.some((d) => d.requestId === request.id),
    )
    .forEach((request) => push(`${request.id} "${request.title}" | ${request.priority} | not in this plan`));

  const text = lines.join("\n");
  return { text, allowedNumbers: extractNumbers(text) };
}

/** Solve all five profiles so the assistant can answer comparison questions. */
export function comparisonTable(): string {
  const rows = strategyList.map((profile) => {
    const run = solve({ strategy: profile.id });
    return [
      profile.id,
      run.status,
      `placed ${run.plan.placements.length}/${requests.length}`,
      `weighted completion ${run.metrics.weightedCompletion.value}%`,
      `movement ${run.metrics.movement.value} min`,
      `emergency capacity ${run.metrics.emergencyCapacity.value}%`,
      `recovery gap held ${run.metrics.bufferCompliance.value}%`,
      `violations ${run.violations.length}`,
    ].join(" | ");
  });
  return rows.join("\n");
}

/**
 * Numeric tokens, normalised so "02:30" and "2:30" compare equal and a
 * percentage written as "85.9" matches the metric it came from.
 */
export function extractNumbers(text: string): Set<string> {
  const cleaned = text.replace(/^\s*\d+[.)]\s+/gm, "");
  const tokens = cleaned.match(/\d+(?::\d+)?(?:\.\d+)?/g) ?? [];
  const set = new Set<string>();
  tokens.forEach((token) => {
    set.add(normaliseNumber(token));
    // A clock time is also legitimate to quote as its component parts.
    if (token.includes(":")) {
      token.split(":").forEach((part) => set.add(normaliseNumber(part)));
    }
  });
  return set;
}

export function normaliseNumber(token: string): string {
  if (token.includes(":")) {
    const [hours, minutes] = token.split(":");
    return `${Number(hours)}:${minutes.padStart(2, "0")}`;
  }
  const value = Number(token);
  return Number.isFinite(value) ? String(value) : token;
}
