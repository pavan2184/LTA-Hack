import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Disruption } from "@railplan/ps1/engine/disruption";
import type { Ps1Instance, Submission } from "@railplan/ps1/types/ps1";
import { checkedCpSatResult, cpSatPayload } from "../../../src/lib/ps1/cp-sat-model";

export { decode } from "../../../src/lib/ps1/cp-sat-model";

export function runCpSat(python: string, instance: Ps1Instance, incumbent: Submission,
  seconds: number, movableActivityIds?: string[], disruptions: Disruption[] = []) {
  const payload = cpSatPayload(instance, { scenario: incumbent.scenario, seconds,
    incumbent, movableActivityIds, disruptions });
  const started = performance.now();
  const child = spawnSync(python, [resolve("scripts/ps1/benchmark/cp_sat.py")], {
    input: JSON.stringify(payload), encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
    timeout: seconds * 1000 + 60_000,
  });
  if (child.error || child.status !== 0) throw new Error(child.error?.message ?? child.stderr);
  const result = checkedCpSatResult(payload, JSON.parse(child.stdout), disruptions);
  return { ...result, elapsedMs: performance.now() - started };
}

// Run against a benchmark witness; no production dependency or server required.
if (process.argv[1]?.endsWith("cp-sat.ts")) {
  const [python, witness, secondsRaw = "5", mode = "full"] = process.argv.slice(2);
  if (!python || !witness || !["full", "repair"].includes(mode) || !(Number(secondsRaw) > 0)) {
    throw new Error("Usage: cp-sat.ts <python> <benchmark-witness.json> [seconds] [full|repair]");
  }
  const { instance, submission } = JSON.parse(readFileSync(witness, "utf8")) as { instance: Ps1Instance; submission: Submission };
  const movable = mode === "repair" ? [...instance.activities].sort((a, b) => {
    const last = (id: string) => Math.max(...submission.access.filter((r) => r.activityId === id).map((r) => r.week));
    return last(b.activityId) - last(a.activityId);
  }).slice(0, 20).map((a) => a.activityId) : undefined;
  const result = runCpSat(python, instance, submission, Number(secondsRaw), movable);
  writeFileSync(`${witness}.${mode}.cpsat.json`, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ status: result.status, objective: result.objective, bound: result.bound, elapsedMs: result.elapsedMs }));
}
