import { validate } from "@railplan/ps1/engine/validate";
import { parseSubmission } from "@railplan/ps1/io/submission";
import { writeSubmission } from "@railplan/ps1/io/write";
import type { Ps1Instance, Scenario, Submission } from "@railplan/ps1/types/ps1";

/** Check the exact files that will be exported, not only the in-memory object. */
export function checkSubmission(instance: Ps1Instance, scenario: Scenario, submission: Submission) {
  if (submission.scenario !== scenario) throw new Error("Submission scenario mismatch");
  const files = writeSubmission(submission);
  const decoded = parseSubmission({ access: files["SCHEDULE_ACCESS.csv"],
    occupancy: files["SCHEDULE_OCCUPANCY.csv"], results: files["RESULTS.csv"] });
  if (decoded.scenario !== scenario) throw new Error("CSV scenario mismatch");
  const validation = validate(instance, decoded);
  const score = validation.objectiveScore;
  if (!validation.feasible || score === undefined || !Number.isFinite(score) || score < 0) {
    throw new Error(`Submission failed local CSV validation: ${JSON.stringify(validation.hardViolations)}`);
  }
  return { submission: decoded, files, validation, score };
}

export type NativeCandidate = {
  status: string;
  scope: "full" | "repair";
  objective: number | null;
  bound: number | null;
  submission?: Submission;
};

/** A failed, unknown or worse native attempt never discards a valid incumbent. */
export function selectNativeSubmission(instance: Ps1Instance, scenario: Scenario,
  incumbent?: Submission, native?: NativeCandidate) {
  const warnings: string[] = [];
  let incumbentChecked: ReturnType<typeof checkSubmission> | undefined;
  let nativeChecked: ReturnType<typeof checkSubmission> | undefined;
  try {
    if (incumbent) incumbentChecked = checkSubmission(instance, scenario, incumbent);
  } catch (cause) {
    warnings.push(`Incumbent rejected: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (native && ["FEASIBLE", "OPTIMAL"].includes(native.status)) {
    try {
      if (!native.submission) throw new Error("Native feasible status has no submission");
      nativeChecked = checkSubmission(instance, scenario, native.submission);
      if (native.objective === null || !Number.isFinite(native.objective) ||
        Math.abs(nativeChecked.score - native.objective) > 1e-6) {
        throw new Error("Native objective disagrees with the local CSV score");
      }
    } catch (cause) {
      nativeChecked = undefined;
      warnings.push(`Native candidate rejected: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  const useNative = nativeChecked !== undefined &&
    (incumbentChecked === undefined || nativeChecked.score < incumbentChecked.score);
  const selected = useNative ? nativeChecked : incumbentChecked;
  if (native?.status === "INFEASIBLE" && incumbentChecked) {
    warnings.push("Native infeasibility conflicts with the validated incumbent; retaining the incumbent and requiring model investigation.");
  }
  const nativeBoundMatches = native?.status === "OPTIMAL" && native.scope === "full" &&
    nativeChecked !== undefined && selected !== undefined && native.bound !== null &&
    Number.isFinite(native.bound) && Math.abs(native.bound - selected.score) < 1e-6 &&
    Math.abs(nativeChecked.score - selected.score) < 1e-6;
  return { selected, source: selected ? (useNative ? "native_cpsat" : "hybrid_incumbent") : "none",
    incumbentScore: incumbentChecked?.score ?? null,
    candidateScore: nativeChecked?.score ?? null,
    optimalityEvidence: selected?.score === 0 ? "zero_penalty_lower_bound" :
      nativeBoundMatches ? "native_full_model_bound" : "not_proven",
    warnings };
}
