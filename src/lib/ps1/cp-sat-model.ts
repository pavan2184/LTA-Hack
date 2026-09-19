import { createHash } from "node:crypto";
import { appliesTo, capacityAt, type Disruption } from "@railplan/ps1/engine/disruption";
import { closureConflicts, CLOSURE_MODEL_VERSION } from "@railplan/ps1/engine/closure";
import { buildNetwork, closureFor, expandSpan } from "@railplan/ps1/engine/network";
import { resultsFor, type Pin } from "@railplan/ps1/engine/schedule";
import { validate } from "@railplan/ps1/engine/validate";
import { parseSubmission } from "@railplan/ps1/io/submission";
import { writeSubmission } from "@railplan/ps1/io/write";
import type { AccessRow, OccupancyRow, Ps1Instance, Scenario, Submission } from "@railplan/ps1/types/ps1";

export interface CpSatOptions {
  scenario: Scenario;
  seconds: number;
  workers?: number;
  seed?: number;
  profile?: "default" | "no_lp" | "lns";
  formulation?: "baseline" | "tight";
  incumbent?: Submission;
  pins?: Pin[];
  disruptions?: Disruption[];
  movableActivityIds?: string[];
}

export class NativeModelSizeError extends Error {}

/** Conservative construction limits for the explicit sharing/forest models. */
export const NATIVE_CLOSURE_LIMITS = { variables: 1_000_000, constraints: 4_000_000, pairs: 100_000 } as const;

function closureModelSize(instance: Ps1Instance, spans: Record<string, string[]>) {
  const contracts = new Map(instance.contracts.map((contract) => [contract.contractNumber, contract]));
  const byLocation = new Map<string, { pc: number; c: number }>();
  let nonLiveC = 0, nonLivePc = 0;
  for (const activity of instance.activities) {
    const contract = contracts.get(activity.contractNumber)!;
    const kind = contract.accessType;
    if (contract.natureOfActivity !== "Live") {
      if (kind === "C") nonLiveC += 1;
      if (kind === "PC") nonLivePc += 1;
    }
    for (const location of spans[activity.activityId]) {
      const counts = byLocation.get(location) ?? { pc: 0, c: 0 };
      if (kind === "PC") counts.pc += 1;
      if (kind === "C") counts.c += 1;
      byLocation.set(location, counts);
    }
  }
  let assignments = 0, possibleEdges = 0;
  for (const { pc, c } of byLocation.values()) {
    assignments += c * pc + c * (c + 1) / 2;
    possibleEdges += c * pc + c * (c - 1) / 2;
  }
  // Repeated edges at different locations deliberately overestimate forest
  // size. Include SCIP's first/last selectors and positive-part auxiliaries.
  const n = instance.activities.length, h = instance.parameters.horizonWeeks, locations = byLocation.size;
  // Only non-Live C/C and PC/C pairs are compatible before geometry. Count
  // every other possible directed relation without materializing an O(n²)
  // array of intersections. This is a conservative admission bound.
  const possiblePairs = n * (n - 1) - nonLiveC * (nonLiveC - 1) - 2 * nonLiveC * nonLivePc;
  return {
    variables: (7 * n + assignments + 3 * possibleEdges + 2 * locations) * h + 3 * n + instance.lines.length,
    constraints: (14 * n + 5 * assignments + 12 * possibleEdges + 6 * locations + 2 * possiblePairs) * h,
    pairs: possiblePairs,
  };
}

/** One serialization contract for the native service and offline comparisons. */
export function cpSatPayload(instance: Ps1Instance, options: CpSatOptions) {
  const network = buildNetwork(instance);
  const contracts = new Map(instance.contracts.map((contract) => [contract.contractNumber, contract]));
  const disruptions = options.disruptions ?? [];
  const pins = options.pins ?? [];
  const activityIds = new Set(instance.activities.map((activity) => activity.activityId));
  if (options.movableActivityIds) {
    if (!options.incumbent) throw new Error("Repair requires an incumbent");
    if (new Set(options.movableActivityIds).size !== options.movableActivityIds.length ||
      options.movableActivityIds.some((id) => !activityIds.has(id))) {
      throw new Error("Invalid native movable activity IDs");
    }
  }
  for (const pin of pins) {
    if (!activityIds.has(pin.activityId) || !Number.isInteger(pin.week) || pin.week < 1 ||
      pin.week > instance.parameters.horizonWeeks || ![0, 1].includes(pin.eclo ?? 0)) {
      throw new Error("A solver pin does not identify an activity and week in this instance.");
    }
  }
  const spans = Object.fromEntries(instance.activities.map((activity) => [activity.activityId,
    expandSpan(network, activity.startLocationId, activity.endLocationId)]));
  const modelSize = closureModelSize(instance, spans);
  if (modelSize.variables > NATIVE_CLOSURE_LIMITS.variables || modelSize.constraints > NATIVE_CLOSURE_LIMITS.constraints ||
    modelSize.pairs > NATIVE_CLOSURE_LIMITS.pairs) {
    throw new NativeModelSizeError("The explicit closure model exceeds the native construction size limit.");
  }
  const closurePairs = closureConflicts(instance, network).map(({ sourceId, targetId }) => [sourceId, targetId]);
  const fields = {
    schema: "ps1-cpsat-v1" as const,
    closureModelVersion: CLOSURE_MODEL_VERSION as typeof CLOSURE_MODEL_VERSION,
    instance, scenario: options.scenario, seconds: options.seconds,
    workers: options.workers ?? 1, seed: options.seed ?? 1,
    ...(options.profile !== undefined ? { profile: options.profile } : {}),
    ...(options.formulation !== undefined ? { formulation: options.formulation } : {}),
    ...(options.incumbent ? { incumbent: options.incumbent } : {}),
    ...(options.movableActivityIds ? { movableActivityIds: options.movableActivityIds } : {}),
    pins, spans, closurePairs,
    affectedLines: Object.fromEntries(instance.activities.map((activity) => [activity.activityId,
      [...new Set(closureFor(network, spans[activity.activityId], contracts.get(activity.contractNumber)!.natureOfActivity)
        .map((id) => network.supply.get(id)!.lineCode))]])),
    capacity: Object.fromEntries(instance.locationSupply.map((location) => [location.locationId,
      Array.from({ length: instance.parameters.horizonWeeks }, (_, index) =>
        capacityAt(network, disruptions, location.locationId, index + 1))])),
    disrupted: Object.fromEntries(instance.locationSupply.map((location) => [location.locationId,
      Array.from({ length: instance.parameters.horizonWeeks }, (_, index) =>
        disruptions.some((disruption) => appliesTo(disruption, location.locationId, index + 1)))])),
  };
  return { ...fields, digest: createHash("sha256").update(JSON.stringify(fields)).digest("hex") };
}

/** Decode legal possession groups independently of the CP-SAT packing formula. */
export function decode(instance: Ps1Instance, scenario: Scenario, access: AccessRow[]): Submission {
  const network = buildNetwork(instance);
  const contracts = new Map(instance.contracts.map((contract) => [contract.contractNumber, contract]));
  const activities = new Map(instance.activities.map((activity) => [activity.activityId, activity]));
  const byLocationWeek = new Map<string, { locationId: string; week: number; ids: string[] }>();
  for (const row of access) {
    const activity = activities.get(row.activityId);
    if (!activity) throw new Error("CP-SAT returned an unknown activity.");
    for (const locationId of expandSpan(network, activity.startLocationId, activity.endLocationId)) {
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
      const group = groups.find((candidate) => candidate.length < 4);
      if (group) group.push(id); else groups.push([id]);
    }
    groups.push(...ids.filter((id) => type(id) === "PM").map((id) => [id]));
    groups.forEach((group, index) => group.forEach((activityId) => occupancy.push({
      activityId, week, locationId, coShareGroup: `b${index + 1}`,
    })));
  }
  return { scenario, access, occupancy, results: resultsFor(instance, access, scenario) };
}

export function hasPins(submission: Submission, pins: Pin[]) {
  const accesses = new Set(submission.access.map((row) => `${row.activityId}|${row.week}|${row.eclo}`));
  return pins.every((pin) => accesses.has(`${pin.activityId}|${pin.week}|${pin.eclo ?? 0}`));
}

export type CpSatStatus = "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN";
export interface CpSatResult {
  schema: "ps1-cpsat-v1";
  closureModelVersion: typeof CLOSURE_MODEL_VERSION;
  digest: string;
  scenario: Scenario;
  scope: "full" | "repair";
  status: CpSatStatus;
  ortoolsVersion: string;
  objective: number | null;
  bound: number;
  solveMs: number;
  modelAndSolveMs: number;
  access: AccessRow[];
  occupancy: OccupancyRow[];
}

/** Native output is untrusted until provenance, CSVs, hard rules and score agree. */
export function checkedCpSatResult(payload: ReturnType<typeof cpSatPayload>, value: unknown,
  disruptions: Disruption[] = []) {
  const result = value as CpSatResult | null;
  if (!result || result.digest !== payload.digest || result.schema !== payload.schema ||
    result.closureModelVersion !== payload.closureModelVersion ||
    result.scenario !== payload.scenario || !["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN"].includes(result.status) ||
    result.scope !== (payload.movableActivityIds && payload.movableActivityIds.length < payload.instance.activities.length ? "repair" : "full") ||
    !Number.isFinite(result.bound) || result.bound < 0 || !Number.isFinite(result.solveMs) || result.solveMs < 0 ||
    !Number.isFinite(result.modelAndSolveMs) || result.modelAndSolveMs < 0 ||
    typeof result.ortoolsVersion !== "string" || !Array.isArray(result.access) || !Array.isArray(result.occupancy)) {
    throw new Error("CP-SAT returned an invalid result or mismatched provenance.");
  }
  let submission: Submission | undefined;
  let report: ReturnType<typeof validate> | undefined;
  if (result.status === "FEASIBLE" || result.status === "OPTIMAL") {
    if (typeof result.objective !== "number" || !Number.isFinite(result.objective) ||
      result.objective < 0 || result.bound > result.objective + 1e-6 ||
      (result.status === "OPTIMAL" && Math.abs(result.bound - result.objective) > 1e-6)) {
      throw new Error("CP-SAT returned an inconsistent objective bound.");
    }
    // Sharing is part of the solved model. Greedy regrouping here could break
    // a transitive closure exemption or change the actual capacity penalty.
    const csv = writeSubmission({ scenario: payload.scenario, access: result.access, occupancy: result.occupancy,
      results: resultsFor(payload.instance, result.access, payload.scenario) });
    submission = parseSubmission({ access: csv["SCHEDULE_ACCESS.csv"],
      occupancy: csv["SCHEDULE_OCCUPANCY.csv"], results: csv["RESULTS.csv"] });
    report = validate(payload.instance, submission, undefined, disruptions);
    if (!report.feasible || Math.abs(report.objectiveScore! - result.objective) > 1e-6 ||
      !hasPins(submission, payload.pins)) {
      throw new Error("CP-SAT output failed local CSV, hard-rule, pin or objective validation.");
    }
  }
  return { ...result, submission, report };
}
