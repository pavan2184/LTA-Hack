/**
 * Synthetic stress inputs, declared before any solver comparisons.
 *
 * The split is fixed: tune on development only, then evaluate holdout once.
 * Holdout instances share generation families, so they are not independent
 * operational data. Seeds are never rejected according to solver performance.
 * Original inputs and witness candidates are retained after checker corrections.
 * Failed candidates are quarantined with their violations, never represented as
 * feasibility certificates or fed to a benchmark solver.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildNetwork, closureFor, expandSpan } from "@railplan/ps1/engine/network";
import { CLOSURE_MODEL_VERSION } from "@railplan/ps1/engine/closure";
import { isoDate, validate, weekEnd, weekStart } from "@railplan/ps1/engine/validate";
import { loadInstance, PS1_FILES, validateInstance } from "@railplan/ps1/io/load";
import { parseSubmission } from "@railplan/ps1/io/submission";
import { writeSubmission } from "@railplan/ps1/io/write";
import type { AccessRow, AccessType, Activity, Contract, HardViolation, NatureOfWorks, Ps1Instance, Submission } from "@railplan/ps1/types/ps1";
import { decode } from "../../../src/lib/ps1/cp-sat-model";

export type StressSplit = "development" | "holdout";
export type StressFamily = "shared-hubs" | "chain-bottlenecks" | "live-interchange" | "mixed-spans";

export interface StressDefinition {
  readonly id: string;
  readonly split: StressSplit;
  readonly family: StressFamily;
  readonly seed: number;
  readonly activities: number;
}

/** v1 is immutable experiment input: changes require a new generator version. */
export const STRESS_GENERATOR_VERSION = "ps1-stress-v1";
export const STRESS_MANIFEST: readonly StressDefinition[] = Object.freeze([
  { id: "stress-dev-shared-60", split: "development", family: "shared-hubs", seed: 730101, activities: 60 },
  { id: "stress-dev-chain-72", split: "development", family: "chain-bottlenecks", seed: 730103, activities: 72 },
  { id: "stress-dev-live-96", split: "development", family: "live-interchange", seed: 730107, activities: 96 },
  { id: "stress-dev-mixed-120", split: "development", family: "mixed-spans", seed: 730109, activities: 120 },
  { id: "stress-holdout-shared-60", split: "holdout", family: "shared-hubs", seed: 830111, activities: 60 },
  { id: "stress-holdout-chain-72", split: "holdout", family: "chain-bottlenecks", seed: 830113, activities: 72 },
  { id: "stress-holdout-live-96", split: "holdout", family: "live-interchange", seed: 830117, activities: 96 },
  { id: "stress-holdout-mixed-120", split: "holdout", family: "mixed-spans", seed: 830119, activities: 120 },
].map((definition) => Object.freeze(definition as StressDefinition)));

export interface StressInstance {
  id: string;
  split: StressSplit;
  instance: Ps1Instance;
  metadata: {
    generatorVersion: typeof STRESS_GENERATOR_VERSION;
    family: StressFamily;
    seed: number;
    instanceSha256: string;
    topologySha256: string;
    splitPolicy: string;
    generation: string;
    certificateScope: "local_checker_only";
    certificateClosureModelVersion: typeof CLOSURE_MODEL_VERSION;
    certificateStatus: { A: "valid" | "quarantined"; C: "valid" | "quarantined" };
    certificateFailures: { A: HardViolation[]; C: HardViolation[] };
    witnessPolicy: "verification_only_not_solver_hints";
    scenarioBFeasibility: "not_certified_keep_all_outcomes";
    counts: {
      activities: number;
      contracts: number;
      accessNights: number;
      predecessorEdges: number;
      crossContractEdges: number;
      liveActivities: number;
      liveCrossLineActivities: number;
      minimumSupply: number;
      maximumSupply: number;
    };
    witnessScores: { A: number | null; C: number | null };
  };
  /** Only currently checked complete certificates are available to consumers. */
  witnesses: Partial<Record<"A" | "C", Submission>>;
  /** Historical witness candidates retained for audit, not feasible export. */
  quarantinedWitnesses: Partial<Record<"A" | "C", Submission>>;
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return (max: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor(state / 4294967296 * max);
  };
}

function checkedWitness(instance: Ps1Instance, scenario: "A" | "C", access: AccessRow[]) {
  const csv = writeSubmission(decode(instance, scenario, structuredClone(access)));
  const submission = parseSubmission({ access: csv["SCHEDULE_ACCESS.csv"],
    occupancy: csv["SCHEDULE_OCCUPANCY.csv"], results: csv["RESULTS.csv"] });
  const report = validate(instance, submission);
  return { submission, score: report.feasible ? report.objectiveScore! : null, report };
}

function generate(definition: StressDefinition, topology: Ps1Instance): StressInstance {
  const random = seededRandom(definition.seed);
  const instance: Ps1Instance = structuredClone(topology);
  instance.parameters.horizonWeeks = 30;
  instance.contracts = [];
  instance.activities = [];
  const origin = instance.parameters.horizonStart;
  const access: AccessRow[] = [];
  const witnessWeeks = new Map<string, { first: number; last: number }>();
  const familiesWithLive = ["live-interchange", "mixed-spans"];
  const accessTypes: AccessType[] = ["PM", "PC", "C", "C"];

  for (let ci = 0; ci < definition.activities / 6; ci += 1) {
    const contractNumber = `${definition.id}-P${String(ci + 1).padStart(2, "0")}`;
    const live = familiesWithLive.includes(definition.family) && ci % 4 === 0;
    const nature: NatureOfWorks = live ? "Live" : ci % 4 === 1 ? "Non-live (Consist)" : "Non-live (Others)";
    const contract: Contract = {
      contractNumber, contractDescription: `Synthetic ${definition.family} contract ${ci + 1}`,
      contractAwardDate: origin, activityType: "stress-work", natureOfActivity: nature,
      contractPriority: (1 + (ci + random(3)) % 3) as 1 | 2 | 3,
      contractCompletionDate: isoDate(weekEnd(origin, 30)),
      plannedCompletionDate: origin,
      numberOfWorkfronts: ci % 3 === 0 ? 2 : 1,
      accessType: accessTypes[ci % accessTypes.length],
      numberOfMaximumAccessPerWeek: live ? 2 : 3,
    };
    instance.contracts.push(contract);
    // Two parallel three-stage chains establish a full-workload candidate
    // without a solver; this alone does not establish closure feasibility.
    // Maximum start 8 + three six-night stages + two one-week gaps < 30.
    const cursor = [2 + random(7), 2 + random(7)];
    const previous: (string | null)[] = [null, null];
    let contractFinish = 0;
    for (let ai = 0; ai < 6; ai += 1) {
      const lane = ai % 2;
      const activityId = `${contractNumber}-A${ai + 1}`;
      const work = definition.family === "chain-bottlenecks" ? 3 + random(4) : 2 + random(5);
      const first = cursor[lane];
      const last = first + work - 1;
      if (last > 30) throw new Error("Stress certificate exceeds the declared horizon");
      witnessWeeks.set(activityId, { first, last });
      contractFinish = Math.max(contractFinish, last);
      let line = random(4) === 0 ? "BET" : "ALP";
      if (definition.family === "mixed-spans" || definition.family === "live-interchange") line = random(2) ? "ALP" : "BET";
      const bound = random(4) === 0 ? "WB" : "EB";
      const sectors = instance.sectors.filter((sector) => sector.lineCode === line).sort((a, b) => a.seq - b.seq);
      let lo: number;
      let hi: number;
      if (live || definition.family === "shared-hubs") {
        // Index 4 is H01_H02; Live closes both bounds and crosses both lines.
        lo = 3 + random(2);
        hi = 4 + random(2);
      } else if (definition.family === "chain-bottlenecks") {
        lo = 2 + random(3);
        hi = Math.min(8, lo + random(3));
      } else {
        lo = random(7);
        hi = Math.min(8, lo + 1 + random(3));
      }
      const activity: Activity = {
        activityId, contractNumber, activityType: contract.activityType,
        startLocationId: `${sectors[lo].sectorId}:${bound}`,
        endLocationId: `${sectors[hi].sectorId}:${bound}`,
        totalAccesses: work,
        plannedStartDate: isoDate(weekStart(origin, Math.max(1, first - 2 - random(5)))),
        predecessorActivityId: previous[lane],
        activityPriority: (1 + random(3)) as 1 | 2 | 3,
      };
      instance.activities.push(activity);
      for (let seq = 1; seq <= work; seq += 1) {
        access.push({ activityId, accessSeq: seq, week: first + seq - 1, eclo: 0, accessNight: 1 });
      }
      cursor[lane] = last + 1 + random(2);
      previous[lane] = activityId;
    }
    // Tight deadlines create delay/capacity/ECLO trade-offs independently of
    // solver results. Feasibility is checked below, never inferred from this
    // historical witness, which predates external-closure enforcement.
    const dueWeek = Math.max(5, contractFinish - 5 - random(6));
    contract.plannedCompletionDate = isoDate(weekEnd(origin, dueWeek));
  }

  // Add cross-contract precedence without losing the candidate's temporal order.
  // Temporal ordering precludes cycles; half the original chains stay intact.
  for (let index = 3; index < instance.activities.length; index += 4) {
    const activity = instance.activities[index];
    const first = witnessWeeks.get(activity.activityId)!.first;
    const candidates = instance.activities.filter((candidate) => candidate.contractNumber !== activity.contractNumber &&
      witnessWeeks.get(candidate.activityId)!.last < first);
    if (candidates.length) activity.predecessorActivityId = candidates[random(candidates.length)].activityId;
  }
  const contracts = new Map(instance.contracts.map((contract) => [contract.contractNumber, contract]));
  const activities = new Map(instance.activities.map((activity) => [activity.activityId, activity]));
  const nightlyCount = new Map<string, number>();
  for (const row of access) {
    const contract = contracts.get(activities.get(row.activityId)!.contractNumber)!;
    const key = `${contract.contractNumber}|${row.week}`;
    const count = nightlyCount.get(key) ?? 0;
    row.accessNight = Math.floor(count / contract.numberOfWorkfronts) + 1;
    nightlyCount.set(key, count + 1);
  }

  // The public topology is reused, but each capacity is derived from this
  // historical candidate's peak possession count, never from optimiser output.
  const occupancy = decode(instance, "A", access).occupancy;
  const possessions = new Map<string, Set<string>>();
  for (const row of occupancy) {
    const key = `${row.locationId}|${row.week}`;
    const groups = possessions.get(key) ?? new Set<string>();
    groups.add(row.coShareGroup);
    possessions.set(key, groups);
  }
  for (const location of instance.locationSupply) {
    location.supplyCapacity = Math.max(1, ...Array.from({ length: 30 }, (_, index) =>
      possessions.get(`${location.locationId}|${index + 1}`)?.size ?? 0));
  }
  validateInstance(instance);
  const a = checkedWitness(instance, "A", access);
  const c = checkedWitness(instance, "C", access);
  const network = buildNetwork(instance);
  const liveActivities = instance.activities.filter((activity) => contracts.get(activity.contractNumber)!.natureOfActivity === "Live");
  const crossLine = liveActivities.filter((activity) => new Set(closureFor(network,
    expandSpan(network, activity.startLocationId, activity.endLocationId), "Live")
    .map((locationId) => network.supply.get(locationId)!.lineCode)).size > 1);
  const topologyFields = { lines: topology.lines, stations: topology.stations, sectors: topology.sectors,
    bufferRules: topology.bufferRules, horizonStart: topology.parameters.horizonStart };
  return {
    id: definition.id, split: definition.split, instance,
    metadata: {
      generatorVersion: STRESS_GENERATOR_VERSION, family: definition.family, seed: definition.seed,
      instanceSha256: hash(instance), topologySha256: hash(topologyFields),
      splitPolicy: "Fixed four development / four holdout seeds; no solver-based rejection or retuning of holdout.",
      generation: "Two three-stage chains per contract; seeded spans, workloads, priorities and compressed deadlines; exact peak witness possession capacities.",
      certificateScope: "local_checker_only", witnessPolicy: "verification_only_not_solver_hints",
      certificateClosureModelVersion: CLOSURE_MODEL_VERSION,
      certificateStatus: { A: a.report.feasible ? "valid" : "quarantined", C: c.report.feasible ? "valid" : "quarantined" },
      certificateFailures: { A: a.report.hardViolations, C: c.report.hardViolations },
      scenarioBFeasibility: "not_certified_keep_all_outcomes",
      counts: {
        activities: instance.activities.length, contracts: instance.contracts.length, accessNights: access.length,
        predecessorEdges: instance.activities.filter((activity) => activity.predecessorActivityId).length,
        crossContractEdges: instance.activities.filter((activity) => activity.predecessorActivityId &&
          activities.get(activity.predecessorActivityId)!.contractNumber !== activity.contractNumber).length,
        liveActivities: liveActivities.length, liveCrossLineActivities: crossLine.length,
        minimumSupply: Math.min(...instance.locationSupply.map((location) => location.supplyCapacity)),
        maximumSupply: Math.max(...instance.locationSupply.map((location) => location.supplyCapacity)),
      },
      witnessScores: { A: a.score, C: c.score },
    },
    witnesses: { ...(a.report.feasible ? { A: a.submission } : {}), ...(c.report.feasible ? { C: c.submission } : {}) },
    quarantinedWitnesses: { ...(!a.report.feasible ? { A: a.submission } : {}), ...(!c.report.feasible ? { C: c.submission } : {}) },
  };
}

/** Generate fixed inputs only; this function never invokes any search algorithm. */
export function generateStressInstances(split?: StressSplit): StressInstance[] {
  if (split !== undefined && split !== "development" && split !== "holdout") throw new Error("Unknown stress split");
  const topology = loadInstance(Object.fromEntries(PS1_FILES.map((name) => [name,
    readFileSync(resolve("packages/ps1/data/public", name), "utf8")])));
  return STRESS_MANIFEST.filter((definition) => split === undefined || definition.split === split)
    .map((definition) => generate(definition, topology));
}
