import { describe, expect, it } from "vitest";

import { answerDeterministically, suggestedQuestions } from "@/lib/assistant/deterministic";
import { buildFactSet, extractNumbers, normaliseNumber } from "@/lib/assistant/facts";
import { checkGrounding, SYSTEM_PROMPT } from "@/lib/assistant/guard";
import { reviewSubmittedPlan, solve } from "@railplan/core/engine/solve";

const planned = solve({ strategy: "balanced" });
const facts = buildFactSet(planned, "planned");

describe("fact set", () => {
  it("carries the provenance a planner would need to check an answer", () => {
    expect(facts.text).toContain(planned.inputHash);
    expect(facts.text).toContain(planned.solverVersion);
    expect(facts.text).toContain(planned.constraintVersion);
    expect(facts.text).toContain(planned.status);
  });

  it("includes every placement, deferral and violation", () => {
    planned.plan.placements.forEach((placement) =>
      expect(facts.text).toContain(placement.requestId),
    );
    planned.plan.deferred.forEach((entry) => expect(facts.text).toContain(entry.requestId));
    planned.violations.forEach((violation) => expect(facts.text).toContain(violation.id));
  });

  it("includes each metric with its formula, so the model never has to derive one", () => {
    Object.values(planned.metrics).forEach((metric) => {
      expect(facts.text).toContain(metric.formula);
      expect(facts.text).toContain(String(metric.value));
    });
  });
});

describe("numeric normalisation", () => {
  it("treats equivalent clock times as the same figure", () => {
    expect(normaliseNumber("02:30")).toBe(normaliseNumber("2:30"));
  });

  it("ignores markdown list numbering, which is formatting rather than a claim", () => {
    expect(extractNumbers("1. hello\n2. world")).toEqual(new Set());
  });

  it("pulls the parts of a clock time out as well as the whole", () => {
    const set = extractNumbers("02:30");
    expect(set.has("2:30")).toBe(true);
    expect(set.has("30")).toBe(true);
  });
});

describe("grounding check", () => {
  it("accepts an answer built only from figures the engine produced", () => {
    const answer = `The plan is ${planned.status} with ${planned.plan.placements.length} jobs placed.`;
    expect(checkGrounding(answer, facts.allowedNumbers).grounded).toBe(true);
  });

  it("rejects an invented figure", () => {
    const report = checkGrounding("Utilisation reached 99999 percent overnight.", facts.allowedNumbers);
    expect(report.grounded).toBe(false);
    expect(report.unsupported).toContain("99999");
  });

  it("rejects arithmetic the model did in its head", () => {
    // Neither figure below appears anywhere in the fact set.
    const report = checkGrounding("That leaves 8137 spare block-minutes.", facts.allowedNumbers);
    expect(report.grounded).toBe(false);
  });

  it("does not trip over prose that contains no figures", () => {
    expect(
      checkGrounding("Rail grinding has to finish before signalling can start.", facts.allowedNumbers)
        .grounded,
    ).toBe(true);
  });

  it("allows headings and bullets without treating their markers as claims", () => {
    const answer = "## Summary\n- The plan is feasible\n1. Check the corridor";
    expect(checkGrounding(answer, facts.allowedNumbers).grounded).toBe(true);
  });

  it("forbids the model from deciding feasibility itself", () => {
    expect(SYSTEM_PROMPT).toContain("Never decide whether something is safe, feasible or permitted");
    expect(SYSTEM_PROMPT).toContain("Answer only from FACTS");
  });
});

describe("engine-only answers", () => {
  it("answers a request question from the explanation engine", () => {
    const answer = answerDeterministically("Why did M-014 move?", planned);
    expect(answer).toContain("M-014");
    expect(checkGrounding(answer, facts.allowedNumbers).grounded).toBe(true);
  });

  it("answers a violation question with real counts", () => {
    const submitted = reviewSubmittedPlan();
    const answer = answerDeterministically("what conflicts are there", submitted);
    expect(answer).toContain(String(submitted.violations.length));
  });

  it("explains a metric with its formula rather than a number alone", () => {
    const answer = answerDeterministically("how is emergency capacity calculated", planned);
    expect(answer).toContain("scenarios");
    expect(answer).toContain(String(planned.metrics.emergencyCapacity.denominator));
  });

  it("stays grounded for every suggested question it offers", () => {
    suggestedQuestions(planned).forEach((question) => {
      const answer = answerDeterministically(question, planned);
      expect(checkGrounding(answer, facts.allowedNumbers).grounded, question).toBe(true);
    });
  });

  it("falls back to a plan summary rather than guessing", () => {
    const answer = answerDeterministically("what is the weather", planned);
    expect(answer).toContain(planned.status);
  });
});
