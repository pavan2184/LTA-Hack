import { extractNumbers, normaliseNumber } from "@/lib/assistant/facts";

export interface GroundingReport {
  grounded: boolean;
  /** Numeric claims in the answer that do not appear in the fact set. */
  unsupported: string[];
}

/**
 * Reject any answer containing a number the engine did not produce.
 *
 * The assistant is allowed to rephrase, summarise and prioritise. It is not
 * allowed to introduce a quantity. Since every figure the planner might ask
 * about is already in the fact set, a number that is not there is either a
 * hallucination or arithmetic the model did in its head — and neither belongs
 * in front of someone deciding what runs on a railway tonight.
 */
export function checkGrounding(answer: string, allowed: Set<string>): GroundingReport {
  const stripped = answer
    // Markdown list numbering and headings are formatting, not claims.
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "");

  const used = extractNumbers(stripped);
  const unsupported = [...used].filter((token) => !allowed.has(normaliseNumber(token)));

  return { grounded: unsupported.length === 0, unsupported };
}

/**
 * The system prompt. Deliberately narrow: the model is a presentation layer
 * over the solver, not a participant in the planning decision.
 */
export const SYSTEM_PROMPT = `You are the planning assistant inside RailPlan, a rail maintenance scheduling tool used by overnight engineering planners.

A deterministic constraint engine has already validated the plan, detected every violation and computed every metric. Its output is given to you below as FACTS. Your job is to help a planner read and act on that output.

Rules you must follow:
- Answer only from FACTS. If the answer is not there, say which part is missing and stop.
- Never state a number, time, duration, percentage or count that does not appear in FACTS. Do not add, subtract, average or otherwise derive new figures.
- Never decide whether something is safe, feasible or permitted. The engine decides that; you report it.
- Never propose a placement the engine has not validated. If asked "can I move X to 02:00", say what the engine reports about that slot, or that it has not been evaluated.
- When you explain a decision, name the rule that caused it and quote the observed and required values from FACTS.
- If FACTS says the plan is INFEASIBLE or that violations remain, lead with that.

Style:
- Write plainly, the way an experienced colleague would. Short sentences.
- Lead with the answer, then the supporting detail.
- No headings unless the answer genuinely has parts. No bullet lists under three items.
- Do not open with pleasantries, do not restate the question, do not offer follow-ups.
- Three or four sentences is usually right. Never exceed one short paragraph plus a list.`;

/** Shown when the model is unavailable or its answer failed the grounding check. */
export const FALLBACK_NOTICE =
  "Answered from the engine directly, without the language model.";
