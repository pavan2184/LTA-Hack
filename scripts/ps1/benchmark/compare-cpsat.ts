/** Native CP-SAT full/repair comparisons, always with local round-trip checking. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCpSat } from "./cp-sat";
import type { Ps1Instance, Submission } from "@railplan/ps1/types/ps1";
const [python, directory = "output/ps1-benchmark", secondsRaw = "1"] = process.argv.slice(2);
if (!python || !(Number(secondsRaw) > 0)) throw new Error("Usage: compare-cpsat.ts <python> [witness-directory] [seconds]");
const summary = JSON.parse(readFileSync(resolve(directory, "summary.json"), "utf8"));
const summaryPath = resolve(directory, "cpsat-summary.json");
const rows: Record<string, unknown>[] = [];
for (const row of summary.results.filter((r: { searchMode: string; seed: number; status: string }) =>
  r.searchMode === "hybrid" && r.seed === 1 && r.status === "FEASIBLE")) {
  const file = resolve(directory, `${row.dataset}-${row.scenario}-hybrid-1.json`);
  const { instance, submission } = JSON.parse(readFileSync(file, "utf8")) as { instance: Ps1Instance; submission: Submission };
  for (const mode of ["full", "repair"] as const) {
    if (mode === "repair" && row.score === 0) continue;
    const last = new Map<string, number>();
    for (const r of submission.access) last.set(r.activityId, Math.max(last.get(r.activityId) ?? 0, r.week));
    const movable = mode === "repair" ? [...instance.activities]
      .sort((a, b) => last.get(b.activityId)! - last.get(a.activityId)!)
      .slice(0, 20).map((a) => a.activityId) : undefined;
    let result;
    try {
      result = runCpSat(python, instance, submission, Number(secondsRaw), movable);
    } catch (cause) {
      // Record infrastructure failures; never omit them from comparison totals.
      rows.push({ dataset: row.dataset, scenario: row.scenario, mode, status: "ERROR",
        incumbentScore: row.score, selectedScore: row.score,
        error: cause instanceof Error ? cause.message : String(cause) });
      writeFileSync(summaryPath, JSON.stringify({ seconds: Number(secondsRaw), results: rows }, null, 2) + "\n");
      continue;
    }
    const { submission: candidate, access: _access, ...metrics } = result;
    void _access;
    const compared = { dataset: row.dataset, mode,
      incumbentScore: row.score, selectedScore: Math.min(row.score, result.objective ?? Infinity),
      ...metrics };
    rows.push(compared);
    writeFileSync(`${file}.${mode}.cpsat.json`, JSON.stringify({ ...result, submission: candidate }, null, 2) + "\n");
    console.log(`${row.dataset} ${row.scenario} ${mode}: ${result.status} ${result.objective} bound=${result.bound}`);
    writeFileSync(summaryPath, JSON.stringify({ seconds: Number(secondsRaw), results: rows }, null, 2) + "\n");
  }
}
