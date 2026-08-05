import { requestById } from "@railplan/core/data/requests";
import { explainPlacement } from "@railplan/core/engine/explain";
import { formatClock } from "@railplan/core/engine/intervals";
import { ruleCatalogue } from "@railplan/core/engine/validate";
import type { SolveResult } from "@railplan/core/types/railplan";

/**
 * Template answers built straight from engine output.
 *
 * This runs when no model is configured, and whenever a model answer fails the
 * grounding check. It is deliberately less fluent and completely reliable — the
 * assistant degrades to being terse rather than to being wrong.
 */
export function answerDeterministically(question: string, result: SolveResult): string {
  const text = question.toLowerCase();
  const requestId = question.toUpperCase().match(/\bM-\d{3}\b/)?.[0] ?? null;

  if (requestId && requestById[requestId]) {
    return describeRequest(requestId, result);
  }

  if (/\b(strateg|objective|compare|trade|instead)\b/.test(text)) {
    return (
      `This plan uses the ${result.strategy} objective. ` +
      `It placed ${result.plan.placements.length} jobs with weighted completion at ${result.metrics.weightedCompletion.value}% ` +
      `and total movement of ${result.metrics.movement.value} minutes. ` +
      `Switch the objective in the toolbar to solve again and compare; every figure is recomputed.`
    );
  }

  if (/\b(defer|not placed|unplaced|left out|dropped)\b/.test(text)) {
    if (!result.plan.deferred.length) return "Every request has a place in this plan.";
    return (
      `${result.plan.deferred.length} requests have no slot: ` +
      result.plan.deferred
        .map((entry) => `${entry.requestId} (${entry.bindingRuleIds[0] ?? "capacity"})`)
        .join(", ") +
      `. Open any of them for the constraint that blocked every candidate start.`
    );
  }

  if (/\b(conflict|violation|clash|wrong|problem|issue|block)\b/.test(text)) {
    if (!result.violations.length) {
      return `The validator found no violations in this plan. It re-checked every rule after solving.`;
    }
    const top = result.violations.slice(0, 3);
    return (
      `${result.violations.length} violations. The largest are: ` +
      top
        .map(
          (violation) =>
            `${violation.requestIds.join(" and ")} breaching ${ruleCatalogue[violation.ruleId].label} by ${violation.shortfallMinutes} minutes`,
        )
        .join("; ") +
      `.`
    );
  }

  if (/\b(metric|formula|comput|calculat|how do you get|derive)\b/.test(text)) {
    const metric = Object.values(result.metrics).find((item) =>
      text.includes(item.label.toLowerCase().split(" ")[0]),
    );
    if (metric) {
      return `${metric.label} is ${metric.value}. Formula: ${metric.formula}. Numerator ${metric.numerator}, denominator ${metric.denominator}. ${metric.note}`;
    }
  }

  if (/\b(emergency|urgent|reserve|capacity)\b/.test(text)) {
    const metric = result.metrics.emergencyCapacity;
    return `Emergency capacity is ${metric.value}%: ${metric.numerator} of ${metric.denominator} scenarios in the versioned set were actually inserted and re-validated against this plan. ${metric.note}`;
  }

  return (
    `Status ${result.status}. ${result.plan.placements.length} jobs placed, ` +
    `${result.plan.deferred.length} deferred, ${result.violations.length} violations, ` +
    `solved in ${result.solveMs} ms across ${result.candidatesEvaluated} candidate start times. ` +
    `Ask about a specific request ID, a violation, or how a metric is computed.`
  );
}

function describeRequest(requestId: string, result: SolveResult): string {
  const request = requestById[requestId];
  const explanation = explainPlacement(result.plan, requestId);
  const placement = result.plan.placements.find((item) => item.requestId === requestId);
  const involved = result.violations.filter((violation) => violation.requestIds.includes(requestId));

  const parts: string[] = [];
  parts.push(explanation?.summary ?? `${requestId} is ${request.title}.`);

  if (placement) {
    parts.push(
      `It runs ${formatClock(placement.startMinute)}-${formatClock(placement.endMinute)} on ${request.blockIds.join(", ")} with ${request.teamId}.`,
    );
  }
  if (involved.length) {
    parts.push(
      `It is involved in ${involved.length} violation${involved.length > 1 ? "s" : ""}: ` +
        involved.map((violation) => ruleCatalogue[violation.ruleId].label).join(", ") +
        `.`,
    );
  }
  return parts.join(" ");
}

/** Suggested questions, generated from what is actually in the current plan. */
export function suggestedQuestions(result: SolveResult): string[] {
  const suggestions: string[] = [];
  const worst = result.violations[0];
  const moved = result.plan.placements
    .map((placement) => ({
      id: placement.requestId,
      delta: Math.abs(placement.startMinute - (requestById[placement.requestId]?.preferredStart ?? 0)),
    }))
    .sort((a, b) => b.delta - a.delta)[0];

  if (worst) suggestions.push(`What is wrong with ${worst.requestIds.join(" and ")}?`);
  if (moved?.delta) suggestions.push(`Why did ${moved.id} move?`);
  if (result.plan.deferred.length) {
    suggestions.push(`Why is ${result.plan.deferred[0].requestId} not placed?`);
  }
  suggestions.push("How is emergency capacity calculated?");
  return suggestions.slice(0, 4);
}
