// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resultsFor, solveInstance } from "@railplan/ps1/engine/schedule";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { checkSubmission, selectNativeSubmission, type NativeCandidate } from "./native-selection";

const instance = loadInstance(Object.fromEntries(PS1_FILES.map((name) => [name,
  readFileSync(resolve("packages/ps1/data/synthetic/01-small-demo", name), "utf8")])));
const early = solveInstance(instance, { scenario: "A" }).submission!;
const late = structuredClone(early);
for (const row of late.access) row.week += 12;
for (const row of late.occupancy) row.week += 12;
late.results = resultsFor(instance, late.access, "A");
const lateScore = checkSubmission(instance, "A", late).score;
const native = (submission = early): NativeCandidate => ({ status: "FEASIBLE", scope: "full",
  objective: checkSubmission(instance, "A", submission).score, bound: 0, submission });

describe("native handoff result selection", () => {
  it("exports the improved native candidate only after exact CSV round-trip validation", () => {
    expect(lateScore).toBeGreaterThan(0);
    const selected = selectNativeSubmission(instance, "A", late, native());
    expect(selected.source).toBe("native_cpsat");
    expect(selected.selected!.score).toBe(0);
    expect(Object.keys(selected.selected!.files)).toHaveLength(3);
    expect(selected.optimalityEvidence).toBe("zero_penalty_lower_bound");
  });

  it("retains the better incumbent when native search returns a worse schedule", () => {
    const selected = selectNativeSubmission(instance, "A", early, native(late));
    expect(selected.source).toBe("hybrid_incumbent");
    expect(selected.selected!.score).toBe(0);
  });

  it("retains an incumbent after UNKNOWN or an error with no native result", () => {
    for (const attempt of [undefined, { status: "UNKNOWN", scope: "full" as const, objective: null, bound: 0 }]) {
      const selected = selectNativeSubmission(instance, "A", late, attempt);
      expect(selected.source).toBe("hybrid_incumbent");
      expect(selected.selected!.score).toBe(lateScore);
      expect(selected.optimalityEvidence).toBe("not_proven");
    }
  });

  it("accepts a valid cold-start native result when no incumbent exists", () => {
    expect(selectNativeSubmission(instance, "A", undefined, native()).source).toBe("native_cpsat");
  });

  it("rejects incomplete work and fabricated native objectives", () => {
    const incomplete = structuredClone(early);
    incomplete.access = [];
    for (const attempt of [{ ...native(), submission: incomplete }, { ...native(late), objective: 0 }]) {
      const selected = selectNativeSubmission(instance, "A", late, attempt);
      expect(selected.source).toBe("hybrid_incumbent");
      expect(selected.selected!.score).toBe(lateScore);
      expect(selected.warnings.join(" ")).toContain("Native candidate rejected");
    }
  });

  it("returns unresolved with no export when neither solver provides valid work", () => {
    const selected = selectNativeSubmission(instance, "A", undefined,
      { status: "UNKNOWN", scope: "full", objective: null, bound: 0 });
    expect(selected.source).toBe("none");
    expect(selected.selected).toBeUndefined();
  });

  it("does not turn a conditional repair bound into a full-model optimality claim", () => {
    const attempt = { ...native(late), status: "OPTIMAL", bound: lateScore };
    expect(selectNativeSubmission(instance, "A", late, attempt).optimalityEvidence).toBe("native_full_model_bound");
    expect(selectNativeSubmission(instance, "A", late, { ...attempt, scope: "repair" }).optimalityEvidence).toBe("not_proven");
  });

  it("flags native infeasibility contradicting a validated incumbent", () => {
    const selected = selectNativeSubmission(instance, "A", late,
      { status: "INFEASIBLE", scope: "full", objective: null, bound: 0 });
    expect(selected.source).toBe("hybrid_incumbent");
    expect(selected.warnings.join(" ")).toContain("conflicts with the validated incumbent");
  });
});
