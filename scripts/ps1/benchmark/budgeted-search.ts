import { solveInstance } from "@railplan/ps1/engine/schedule";
import type { Ps1Instance, Scenario, Submission } from "@railplan/ps1/types/ps1";
import { checkSubmission } from "../native-selection";
import { runNativeSolver } from "./cp-sat";
import { selectRepairNeighborhoods } from "./targeted-repair";

export type SearchVariant = "full" | "tight" | "targeted";
export interface BudgetedOptions {
  python: string;
  seconds: number;
  workers: number;
  seed: number;
  variant: SearchVariant;
}
type Dependencies = {
  now: () => number;
  warm: typeof solveInstance;
  native: typeof runNativeSolver;
};

/** Offline experiment: one deadline includes warm start, model builds and repairs.
 * Child processes are killed at the deadline; synchronous validation can overrun
 * slightly and is measured. This does not alter the deployed 60s search service.
 */
export function budgetedSearch(instance: Ps1Instance, scenario: Scenario, options: BudgetedOptions,
  dependencies: Partial<Dependencies> = {}) {
  if (!Number.isFinite(options.seconds) || options.seconds < 2 ||
    !Number.isInteger(options.workers) || options.workers < 1 || options.workers > 256 ||
    !Number.isInteger(options.seed) || options.seed < 0 || options.seed > 2_147_483_647 ||
    !["full", "tight", "targeted"].includes(options.variant)) throw new Error("Invalid budgeted search options");
  const { now = () => performance.now(), warm = solveInstance, native = runNativeSolver } = dependencies;
  const started = now();
  const deadline = started + options.seconds * 1000;
  const errors: string[] = [];
  let selected: ReturnType<typeof checkSubmission> | undefined;
  let warmStatus: string = "ERROR";
  try {
    const warmOutcome = warm(instance, { scenario,
      optimizationBudget: { seed: options.seed, maxTimeMs: Math.min(1000, options.seconds * 100) } });
    warmStatus = warmOutcome.status;
    if (warmOutcome.status === "FEASIBLE" && warmOutcome.submission) selected = checkSubmission(instance, scenario, warmOutcome.submission);
  } catch (error) {
    warmStatus = "ERROR";
    errors.push(`warm: ${error instanceof Error ? error.message : String(error)}`);
  }
  const baselineScore = selected?.score ?? null;
  const warmMs = now() - started;
  let selectedSource = selected ? "heuristic" : "none";
  let fullBound = 0;
  let fullInfeasible = false;
  const stages: Record<string, unknown>[] = [];
  const proven = () => selected !== undefined && Math.abs(selected.score - fullBound) < 1e-6;

  function stage(label: string, allowanceMs: number, movableActivityIds?: string[]) {
    const remaining = deadline - now();
    const stageMs = Math.min(allowanceMs, remaining);
    // Reserve time for startup/build/CSV checking, identically for both methods.
    if (stageMs < 2500 || proven() || fullInfeasible) return;
    const searchSeconds = (stageMs - 2000) / 1000;
    const stageStarted = now();
    try {
      const result = native(options.python, "cpsat", instance, scenario, searchSeconds, {
        workers: options.workers, seed: options.seed,
        incumbent: selected?.submission, movableActivityIds,
        formulation: options.variant === "tight" ? "tight" : "baseline",
      }, stageMs - 100);
      const candidate = result.submission ? checkSubmission(instance, scenario, result.submission) : undefined;
      if (candidate && (result.objective === null || Math.abs(candidate.score - result.objective) > 1e-6)) {
        throw new Error("Native objective disagrees with checked schedule");
      }
      const next = candidate && (!selected || candidate.score < selected.score) ? candidate : selected;
      if (next && next.score < fullBound - 1e-6) throw new Error("Candidate contradicts earlier full-model bound");
      if (result.status === "INFEASIBLE" && selected) throw new Error("Native infeasibility contradicts checked incumbent");
      if (result.scope === "full") {
        if (!Number.isFinite(result.bound) || (next && result.bound! > next.score + 1e-6)) {
          throw new Error("Full-model bound contradicts checked incumbent");
        }
        fullBound = Math.max(fullBound, result.bound ?? 0);
        fullInfeasible = result.status === "INFEASIBLE";
      }
      if (next !== selected) selectedSource = label;
      selected = next;
      const { submission: _submission, access: _access, report: _report, ...metrics } = result;
      void _submission; void _access; void _report;
      stages.push({ ...metrics, label, searchSeconds, stageBudgetMs: stageMs,
        movableActivityIds, selectedScore: selected?.score ?? null, finishedAtMs: now() - started });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${label}: ${message}`);
      stages.push({ label, status: "ERROR", error: message, searchSeconds, stageBudgetMs: stageMs,
        elapsedMs: now() - stageStarted, finishedAtMs: now() - started,
        selectedScore: selected?.score ?? null });
    }
  }

  if (options.variant === "targeted") {
    stage("full-initial", options.seconds * 300);
    for (let iteration = 0; iteration < 4 && selected && !proven() && deadline - now() >= 2500; iteration += 1) {
      try {
        const neighborhoods = selectRepairNeighborhoods(instance, selected.submission,
          { seed: (options.seed + iteration) % 2_147_483_648 });
        const kind = ["late-chain", "spatial-blockers", "location", "random"][iteration];
        const neighborhood = neighborhoods.find((candidate) => candidate.kind === kind) ?? neighborhoods[iteration % neighborhoods.length];
        if (!neighborhood) break;
        stage(`repair-${iteration}-${neighborhood.kind}`, options.seconds * 120, neighborhood.movableActivityIds);
      } catch (error) {
        errors.push(`neighborhood: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
    stage("full-final", deadline - now());
  } else {
    stage(options.variant, deadline - now());
  }
  const elapsedMs = now() - started;
  return {
    variant: options.variant, selectedScore: selected?.score ?? null,
    submission: selected?.submission as Submission | undefined, selectedSource,
    baselineScore, warmStatus, warmMs, fullBound,
    absoluteGap: selected ? Math.max(0, selected.score - fullBound) : null,
    status: proven() ? "OPTIMAL" : selected ? "FEASIBLE" : fullInfeasible ? "INFEASIBLE" : "UNKNOWN",
    boundScope: "encoded_full_model", stages, errors, elapsedMs,
    budgetMs: options.seconds * 1000, deadlineOverrunMs: Math.max(0, elapsedMs - options.seconds * 1000),
  };
}
