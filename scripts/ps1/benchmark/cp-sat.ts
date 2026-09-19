import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { capacityAt, type Disruption } from "@railplan/ps1/engine/disruption";
import { buildNetwork, closureFor, expandSpan } from "@railplan/ps1/engine/network";
import { resultsFor, type Pin } from "@railplan/ps1/engine/schedule";
import { validate } from "@railplan/ps1/engine/validate";
import { writeSubmission } from "@railplan/ps1/io/write";
import { parseSubmission } from "@railplan/ps1/io/submission";
import type { AccessRow, OccupancyRow, Ps1Instance, Scenario, Submission } from "@railplan/ps1/types/ps1";

/** Decode minimum legal groups independently of the CP-SAT packing formula. */
export function decode(instance: Ps1Instance, scenario: Scenario, access: AccessRow[]): Submission {
  const network = buildNetwork(instance);
  const contracts = new Map(instance.contracts.map((c) => [c.contractNumber, c]));
  const activities = new Map(instance.activities.map((a) => [a.activityId, a]));
  const byLocationWeek = new Map<string, { locationId: string; week: number; ids: string[] }>();
  for (const row of access) {
    const a = activities.get(row.activityId)!;
    for (const locationId of expandSpan(network, a.startLocationId, a.endLocationId)) {
      const key = `${locationId}|${row.week}`;
      const entry = byLocationWeek.get(key) ?? { locationId, week: row.week, ids: [] };
      entry.ids.push(row.activityId);
      byLocationWeek.set(key, entry);
    }
  }
  const occupancy: OccupancyRow[] = [];
  for (const { locationId, week, ids } of byLocationWeek.values()) {
    const type = (id: string) => contracts.get(activities.get(id)!.contractNumber)!.accessType;
    const groups = ids.filter((id) => type(id) === "PC").map((id) => [id]);
    for (const id of ids.filter((id) => type(id) === "C")) {
      const group = groups.find((g) => g.length < 4);
      if (group) group.push(id); else groups.push([id]);
    }
    groups.push(...ids.filter((id) => type(id) === "PM").map((id) => [id]));
    groups.forEach((group, index) => group.forEach((activityId) => occupancy.push({
      activityId, week, locationId, coShareGroup: `b${index + 1}`,
    })));
  }
  return { scenario, access, occupancy, results: resultsFor(instance, access, scenario) };
}

export type NativeOptions = {
  workers?: number;
  seed?: number;
  profile?: "default" | "no_lp" | "lns";
  incumbent?: Submission;
  movableActivityIds?: string[];
  disruptions?: Disruption[];
  pins?: Pin[];
};

export type NativeResult = {
  schema: string; digest: string; scenario: Scenario; scope: "full" | "repair";
  status: string; objective: number | null; bound: number | null; access: AccessRow[];
  solveMs: number; buildMs: number; modelAndSolveMs: number;
  firstSolutionMs?: number | null;
  solutionTrace?: { timeMs: number; objective: number; bound: number }[];
  [key: string]: unknown;
};

export function nativePayload(instance: Ps1Instance, scenario: Scenario, seconds: number,
  options: NativeOptions = {}) {
  const { incumbent, movableActivityIds, disruptions = [], pins = [], workers = 1, seed = 1,
    profile = "default" } = options;
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isInteger(workers) || workers < 1 || workers > 256 ||
    !Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647 || !["default", "no_lp", "lns"].includes(profile)) {
    throw new Error("Invalid native seconds/workers/seed/profile");
  }
  if (incumbent && incumbent.scenario !== scenario) throw new Error("Incumbent scenario mismatch");
  if (movableActivityIds && !incumbent) throw new Error("Repair requires an incumbent");
  for (const pin of pins) {
    if (!instance.activities.some((a) => a.activityId === pin.activityId) || !Number.isInteger(pin.week) ||
      pin.week < 1 || pin.week > instance.parameters.horizonWeeks || (pin.eclo !== undefined && pin.eclo !== 0 && pin.eclo !== 1)) {
      throw new Error("Invalid native pin");
    }
  }
  const satisfiesPins = (s: Submission) => pins.every((pin) => s.access.some((r) =>
    r.activityId === pin.activityId && r.week === pin.week && r.eclo === (pin.eclo ?? 0)));
  const network = buildNetwork(instance);
  if (incumbent && (!validate(instance, incumbent, network, disruptions).feasible || !satisfiesPins(incumbent))) {
    throw new Error("Native incumbent must pass local validation");
  }
  const contracts = new Map(instance.contracts.map((c) => [c.contractNumber, c]));
  const digest = createHash("sha256").update(JSON.stringify({ instance, disruptions })).digest("hex");
  const spans = Object.fromEntries(instance.activities.map((a) => [a.activityId,
    expandSpan(network, a.startLocationId, a.endLocationId)]));
  return { schema: "ps1-cpsat-v1", digest, instance, scenario,
    seconds, workers, seed, profile, incumbent, movableActivityIds, pins, spans,
    affectedLines: Object.fromEntries(instance.activities.map((a) => [a.activityId,
      [...new Set(closureFor(network, spans[a.activityId], contracts.get(a.contractNumber)!.natureOfActivity)
        .map((id) => network.supply.get(id)!.lineCode))]])),
    capacity: Object.fromEntries(instance.locationSupply.map((l) => [l.locationId,
      Array.from({ length: instance.parameters.horizonWeeks }, (_, w) => capacityAt(network, disruptions, l.locationId, w + 1))])),
    disrupted: Object.fromEntries(instance.locationSupply.map((l) => [l.locationId,
      Array.from({ length: instance.parameters.horizonWeeks }, (_, w) => disruptions.some((d) =>
        d.locationId === l.locationId && w + 1 >= d.fromWeek && (d.toWeek === undefined || w + 1 <= d.toWeek)))])),
  };
}

/** Process/model/search/decode timing is separate from the solver's search cap. */
export function runNativeSolver(python: string, engine: "cpsat" | "scip", instance: Ps1Instance,
  scenario: Scenario, seconds: number, options: NativeOptions = {}) {
  const started = performance.now();
  const payload = nativePayload(instance, scenario, seconds, options);
  const payloadReady = performance.now();
  const child = spawnSync(python, [resolve(`scripts/ps1/benchmark/${engine === "cpsat" ? "cp_sat" : "scip"}.py`)], {
    input: JSON.stringify(payload), encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
    timeout: seconds * 1000 + 60_000,
  });
  if (child.error || child.status !== 0) throw new Error(child.error?.message ?? child.stderr);
  const processFinished = performance.now();
  const result = JSON.parse(child.stdout) as NativeResult;
  if (result.digest !== payload.digest || result.schema !== payload.schema || result.scenario !== scenario) {
    throw new Error("Native solver provenance mismatch");
  }
  if (!["FEASIBLE", "OPTIMAL", "UNKNOWN", "INFEASIBLE"].includes(result.status)) {
    throw new Error(`Native solver failed: ${result.status}`);
  }
  let submission: Submission | undefined;
  if (result.status === "FEASIBLE" || result.status === "OPTIMAL") {
    const csv = writeSubmission(decode(instance, scenario, result.access));
    submission = parseSubmission({ access: csv["SCHEDULE_ACCESS.csv"], occupancy: csv["SCHEDULE_OCCUPANCY.csv"], results: csv["RESULTS.csv"] });
    const report = validate(instance, submission, undefined, options.disruptions ?? []);
    const pinned = (options.pins ?? []).every((pin) => submission!.access.some((r) =>
      r.activityId === pin.activityId && r.week === pin.week && r.eclo === (pin.eclo ?? 0)));
    if (!report.feasible || !pinned || result.objective === null || !Number.isFinite(result.objective) ||
      Math.abs(report.objectiveScore! - result.objective) > 1e-6) {
      throw new Error(`Native/local-checker mismatch: ${JSON.stringify({ result, report })}`);
    }
  }
  return { ...result, engine, payloadMs: payloadReady - started,
    processMs: processFinished - payloadReady, validationMs: performance.now() - processFinished,
    elapsedMs: performance.now() - started, submission };
}

export function runCpSat(python: string, instance: Ps1Instance, incumbent: Submission,
  seconds: number, movableActivityIds?: string[], disruptions: Disruption[] = [],
  options: Pick<NativeOptions, "workers" | "seed" | "profile"> = {}) {
  return runNativeSolver(python, "cpsat", instance, incumbent.scenario, seconds,
    { ...options, incumbent, movableActivityIds, disruptions });
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
