import { spawnSync } from "node:child_process";
import { arch, cpus, platform, totalmem } from "node:os";
import { resolve } from "node:path";

import {
  buildInstanceFromLiterals,
  canonicalise,
  instanceDigest,
  type PlanningInstance,
} from "@railplan/core/domain/instance";
import { buildWorld } from "@railplan/core/domain/world";
import { computeMetrics } from "@railplan/core/engine/metrics";
import { solve } from "@railplan/core/engine/solve";
import {
  CONSTRAINT_VERSION,
  isFeasible,
  validate,
  type ValidationContext,
} from "@railplan/core/engine/validate";
import type {
  MaintenanceRequest,
  Plan,
  Placement,
} from "@railplan/core/types/railplan";
import type { WorkforceDemand } from "@railplan/core/types/workforce";

/**
 * Offline CP-SAT reference benchmark.
 *
 * The TypeScript validator stays the only constraint authority. Python never
 * re-models a rule: it receives candidate placements plus no-good cuts derived
 * from `validate()`, optimizes the remaining discrete choice, and hands back a
 * selection that is validated here before any number is reported.
 *
 * Two things make that boundary checkable rather than assumed:
 *
 * 1. Every payload carries the digest of the instance its candidates came from
 *    and the constraint version they were cut against. Python echoes both, and
 *    `runPython` refuses a result whose echo differs. A stale Python process
 *    modelling yesterday's facts fails instead of quietly answering.
 * 2. Every reported plan — CP-SAT or heuristic — is passed through `validate()`
 *    and counted. A fixture whose CP-SAT plan reports critical violations is a
 *    harness failure, not a result.
 */

const PAYLOAD_SCHEMA = "railplan-cp-sat-payload-v2";
const RESULT_SCHEMA = "railplan-cp-sat-result-v2";
const BENCHMARK_VERSION = "railplan-cp-sat-reference-v2";
const TIME_LIMIT_SECONDS = 10;
const RANDOM_SEED = 0;
/** Bound on the lazy-cut loop, so a pathological fixture reports rather than hangs. */
const MAX_CUT_ROUNDS = 200;
/**
 * Wall-clock budget per fixture for the cut loop.
 *
 * Exceeding it is reported as `BUDGET_EXCEEDED` rather than thrown. "CP-SAT did
 * not close this instance in five minutes" is exactly the kind of evidence the
 * solver decision needs, and losing every other fixture's numbers to an
 * exception would hide it.
 */
const FIXTURE_BUDGET_MS = 5 * 60 * 1000;
/**
 * Wall-clock bound on a single Python call.
 *
 * `timeLimitSeconds` bounds CP-SAT's search, not the work around it. As the cut
 * set grows into the tens of thousands, building the model costs far more than
 * solving it, and a fixture budget checked between calls cannot interrupt one
 * call that has already gone long. This bounds the subprocess itself.
 */
const PYTHON_CALL_TIMEOUT_MS = 90 * 1000;

/** Raised when a single solver call is killed for exceeding its wall bound. */
class PythonTimeout extends Error {}

type Candidate = Placement & {
  key: string;
  priorityWeight: number;
};

type Provenance = {
  instanceDigest: string;
  constraintVersion: string;
  fixture: string;
};

type PythonResult = {
  schemaVersion: string;
  provenance: Provenance & {
    modelVersion: string;
    ortoolsVersion: string;
    pythonVersion: string;
  };
  status: "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN" | "MODEL_INVALID";
  objectiveValue: number | null;
  bestObjectiveBound: number;
  wallTimeSeconds: number;
  branches: number;
  conflicts: number;
  selected: Candidate[];
  deferred: string[];
  error?: string;
  message?: string;
};

type Fixture = {
  name: string;
  /** Why this instance is in the set; printed so a result set explains itself. */
  description: string;
  instance: PlanningInstance;
  requests: MaintenanceRequest[];
  context: ValidationContext;
  locked: Placement[];
};

const priorityWeight = { low: 1, medium: 2, high: 4, critical: 8 } as const;
const python = process.argv[2] || process.env.RAILPLAN_PYTHON || "python";
const only = process.argv.slice(3);
const pythonScript = resolve("scripts/benchmark/cp_sat_reference.py");

function candidatesFor(fixture: Fixture): Candidate[] {
  const world = fixture.context.world!;
  const locked = new Map(fixture.locked.map((placement) => [placement.requestId, placement]));
  return fixture.requests.flatMap((request) => {
    const fixed = locked.get(request.id);
    if (fixed) {
      return [{
        ...fixed,
        key: `${request.id}@${fixed.startMinute}`,
        priorityWeight: priorityWeight[request.priority],
      }];
    }
    const latestWindow = fixture.context.windowEnd ?? world.windowEnd;
    const latest = Math.min(request.latestEnd, latestWindow - request.clearanceMinutes)
      - request.durationMinutes;
    const first = Math.ceil(Math.max(request.earliestStart, world.windowStart) / world.slotMinutes)
      * world.slotMinutes;
    const candidates: Candidate[] = [];
    for (let start = first; start <= latest; start += world.slotMinutes) {
      candidates.push({
        key: `${request.id}@${start}`,
        requestId: request.id,
        startMinute: start,
        endMinute: start + request.durationMinutes,
        teamId: request.teamId,
        locked: false,
        priorityWeight: priorityWeight[request.priority],
      });
    }
    return candidates;
  });
}

function runPython(
  fixture: Fixture,
  provenance: Provenance,
  candidates: Candidate[],
  cuts: string[][],
) {
  const payload = {
    schemaVersion: PAYLOAD_SCHEMA,
    provenance,
    requests: fixture.requests.map((request) => ({ id: request.id, mandatory: request.mandatory })),
    candidates,
    cuts,
    timeLimitSeconds: TIME_LIMIT_SECONDS,
    randomSeed: RANDOM_SEED,
  };
  const run = spawnSync(python, [pythonScript], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
    timeout: PYTHON_CALL_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  if (run.signal || (run.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT") {
    throw new PythonTimeout(
      `${fixture.name}: solver call exceeded ${PYTHON_CALL_TIMEOUT_MS / 1000}s with ${cuts.length} cuts`,
    );
  }
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(run.stderr || run.stdout || `Python exited ${run.status}`);
  const parsed = JSON.parse(run.stdout) as PythonResult;
  if (parsed.error) throw new Error(`${parsed.error}: ${parsed.message}`);

  // The handshake. A solver answering about a different night, or built against
  // different constraints, is rejected here rather than averaged into a result.
  if (parsed.schemaVersion !== RESULT_SCHEMA) {
    throw new Error(
      `${fixture.name}: result schema drift — expected ${RESULT_SCHEMA}, received ${parsed.schemaVersion}`,
    );
  }
  for (const field of ["instanceDigest", "constraintVersion", "fixture"] as const) {
    if (parsed.provenance?.[field] !== provenance[field]) {
      throw new Error(
        `${fixture.name}: provenance drift on ${field} — sent ${provenance[field]}, received ${parsed.provenance?.[field]}`,
      );
    }
  }
  return parsed;
}

function planFromSelection(fixture: Fixture, selected: Candidate[]): Plan {
  const selectedIds = new Set(selected.map((candidate) => candidate.requestId));
  return {
    placements: selected.map(({ requestId, startMinute, endMinute, teamId, locked }) => ({
      requestId,
      startMinute,
      endMinute,
      teamId,
      locked,
    })),
    deferred: fixture.requests
      .filter((request) => !selectedIds.has(request.id))
      .map((request) => ({
        requestId: request.id,
        bindingRuleIds: [],
        reason: "Deferred while deriving CP-SAT reference cuts.",
      })),
  };
}

function validatorCuts(fixture: Fixture, plan: Plan, selected: Candidate[]): string[][] {
  const chosen = new Map(selected.map((candidate) => [candidate.requestId, candidate.key]));
  return validate(plan, fixture.context)
    .filter((violation) => violation.severity === "critical")
    .map((violation) => violation.requestIds.map((requestId) =>
      chosen.get(requestId) ?? `defer:${requestId}`,
    ));
}

function seedValidatorCuts(fixture: Fixture, candidates: Candidate[]): string[][] {
  const cuts: string[][] = [];
  for (const candidate of candidates) {
    cuts.push(...validatorCuts(fixture, planFromSelection(fixture, [candidate]), [candidate]));
  }

  const requestById = new Map(fixture.requests.map((request) => [request.id, request]));
  for (let left = 0; left < candidates.length; left += 1) {
    const first = candidates[left];
    for (let right = left + 1; right < candidates.length; right += 1) {
      const second = candidates[right];
      if (first.requestId === second.requestId) continue;
      const firstRequest = requestById.get(first.requestId)!;
      const secondRequest = requestById.get(second.requestId)!;
      const overlaps = first.startMinute < second.endMinute && second.startMinute < first.endMinute;
      const related = firstRequest.dependencies.includes(second.requestId)
        || secondRequest.dependencies.includes(first.requestId);
      if (!overlaps && !related) continue;
      const selected = [first, second];
      cuts.push(...validatorCuts(fixture, planFromSelection(fixture, selected), selected));
    }
  }
  return cuts;
}

type Seed = {
  provenance: Provenance;
  candidates: Candidate[];
  cuts: string[][];
  seedMs: number;
};

/**
 * Derive the validator cuts once per fixture.
 *
 * This is the expensive half — O(candidates²) validator calls — and it is pure
 * TypeScript, so it is identical on every run. Separating it from the solve
 * means the determinism check re-runs only the part whose determinism is
 * actually in question.
 */
function seedFixture(fixture: Fixture): Seed {
  const started = performance.now();
  const candidates = candidatesFor(fixture);
  const cuts: string[][] = [];
  const seen = new Set<string>();
  for (const cut of seedValidatorCuts(fixture, candidates)) {
    const normalized = [...new Set(cut)].sort();
    const key = normalized.join("|");
    if (!normalized.length || seen.has(key)) continue;
    seen.add(key);
    cuts.push(normalized);
  }
  return {
    provenance: {
      instanceDigest: instanceDigest(fixture.instance),
      constraintVersion: CONSTRAINT_VERSION,
      fixture: fixture.name,
    },
    candidates,
    cuts,
    seedMs: Math.round((performance.now() - started) * 100) / 100,
  };
}

function benchmarkCpSat(fixture: Fixture, seed: Seed) {
  const { provenance, candidates } = seed;
  // A fresh working copy: the lazy-cut loop appends, and the seed is reused.
  const cuts: string[][] = seed.cuts.map((cut) => [...cut]);
  const seenCuts = new Set(cuts.map((cut) => cut.join("|")));
  const seededCuts = cuts.length;
  let pythonSeconds = 0;
  let result: PythonResult | null = null;
  const started = performance.now();

  for (let iteration = 1; iteration <= MAX_CUT_ROUNDS; iteration += 1) {
    try {
      result = runPython(fixture, provenance, candidates, cuts);
    } catch (error) {
      if (!(error instanceof PythonTimeout)) throw error;
      // The instance outgrew the approach. That is the finding, not a crash.
      return {
        status: "SOLVER_TIMEOUT" as const,
        plan: null,
        validation: [],
        iterations: iteration,
        candidates: candidates.length,
        seededCuts,
        cuts: cuts.length,
        pythonSolveMs: Math.round(pythonSeconds * 100_000) / 100,
        elapsedMs: Math.round((performance.now() - started) * 100) / 100,
        objectiveValue: null,
        bestObjectiveBound: 0,
        solverProvenance: undefined,
        seedMs: seed.seedMs,
        finalCuts: null,
        note: (error as PythonTimeout).message,
      };
    }
    pythonSeconds += result.wallTimeSeconds;
    const common = {
      iterations: iteration,
      candidates: candidates.length,
      seededCuts,
      cuts: cuts.length,
      pythonSolveMs: Math.round(pythonSeconds * 100_000) / 100,
      elapsedMs: Math.round((performance.now() - started) * 100) / 100,
      objectiveValue: result.objectiveValue,
      bestObjectiveBound: result.bestObjectiveBound,
      solverProvenance: result.provenance,
      seedMs: seed.seedMs,
      /** The exact model the answer came from, so it can be re-solved verbatim. */
      finalCuts: cuts.map((cut) => [...cut]),
    };
    if (!["OPTIMAL", "FEASIBLE"].includes(result.status)) {
      return { status: result.status, plan: null, validation: [], ...common };
    }

    // A fixture that will not close inside its budget is a result about that
    // fixture, not a harness crash. Reporting it keeps every other fixture's
    // numbers rather than discarding the whole run.
    if (performance.now() - started > FIXTURE_BUDGET_MS) {
      return { status: "BUDGET_EXCEEDED" as const, plan: null, validation: [], ...common };
    }

    const plan: Plan = {
      placements: result.selected
        .map((candidate) => ({
          requestId: candidate.requestId,
          startMinute: candidate.startMinute,
          endMinute: candidate.endMinute,
          teamId: candidate.teamId,
          locked: candidate.locked,
        }))
        .sort((a, b) => a.startMinute - b.startMinute || a.requestId.localeCompare(b.requestId)),
      deferred: result.deferred.sort().map((requestId) => ({
        requestId,
        bindingRuleIds: [],
        reason: "Deferred by CP-SAT reference objective.",
      })),
    };
    const validation = validate(plan, fixture.context);
    const mandatoryDeferred = plan.deferred.some((item) =>
      fixture.requests.find((request) => request.id === item.requestId)?.mandatory,
    );
    if (isFeasible(validation) && !mandatoryDeferred) {
      return { status: result.status, plan, validation, ...common };
    }

    const newCuts = validatorCuts(fixture, plan, result.selected)
      .filter((cut) => cut.length > 0);
    if (!newCuts.length) throw new Error(`${fixture.name}: invalid solution produced no cut`);
    let added = 0;
    for (const cut of newCuts) {
      const normalized = [...cut].sort();
      const key = normalized.join("|");
      if (seenCuts.has(key)) continue;
      seenCuts.add(key);
      cuts.push(normalized);
      added += 1;
    }
    if (!added) throw new Error(`${fixture.name}: validator repeated an existing cut`);
  }
  return {
    status: "CUT_LIMIT" as const,
    plan: null,
    validation: [],
    iterations: MAX_CUT_ROUNDS,
    candidates: candidates.length,
    seededCuts,
    cuts: cuts.length,
    pythonSolveMs: Math.round(pythonSeconds * 100_000) / 100,
    elapsedMs: Math.round((performance.now() - started) * 100) / 100,
    objectiveValue: result?.objectiveValue ?? null,
    bestObjectiveBound: result?.bestObjectiveBound ?? 0,
    solverProvenance: result?.provenance,
    seedMs: seed.seedMs,
    finalCuts: cuts.map((cut) => [...cut]),
  };
}

function summarizePlan(plan: Plan | null, requests: MaintenanceRequest[], context: ValidationContext) {
  if (!plan) return null;
  const validation = validate(plan, context);
  const metrics = computeMetrics(plan, validation, requests, context);
  return {
    placed: plan.placements.length,
    deferred: plan.deferred.length,
    mandatoryPlaced: requests.filter((request) => request.mandatory && plan.placements.some((p) => p.requestId === request.id)).length,
    mandatoryTotal: requests.filter((request) => request.mandatory).length,
    weightedCompletionPercent: metrics.weightedCompletion.value,
    movementMinutes: metrics.movement.value,
    emergencyCapacityPercent: metrics.emergencyCapacity.value,
    criticalViolations: validation.filter((violation) => violation.severity === "critical").length,
  };
}

/** Placement identity, used to compare two runs of the same solver. */
function planSignature(plan: Plan | null): string {
  if (!plan) return "none";
  return plan.placements
    .map((p) => `${p.requestId}@${p.startMinute}`)
    .sort()
    .join(",");
}

// --- fixtures ---------------------------------------------------------------

const baseInstance = buildInstanceFromLiterals();
const baseWorld = buildWorld(baseInstance);

function withInstance(instance: PlanningInstance) {
  const canonical = canonicalise(instance);
  return { instance: canonical, world: buildWorld(canonical) };
}

/**
 * A larger night, by cloning the request set onto new ids.
 *
 * Clones carry their own workforce demand rows — without them every clone would
 * trip `WORKFORCE_CAPACITY` as undefined staffing and the fixture would measure
 * a data omission rather than scale. Clones are non-mandatory and their
 * dependencies are remapped inside the clone set, so the copy is self-contained
 * and the mandatory count stays at the original five.
 */
function largerInstance(cloneEvery: number): PlanningInstance {
  const suffix = "-C2";
  const source = baseInstance.requests.filter((_, index) => index % cloneEvery === 0);
  const clones: MaintenanceRequest[] = source.map((request) => ({
    ...request,
    id: `${request.id}${suffix}`,
    mandatory: false,
    dependencies: request.dependencies.map((id) => `${id}${suffix}`),
    // Offset the requested time so clones do not all collide on the originals'
    // preferred slots, which would make the fixture a single pile-up.
    preferredStart: Math.min(
      request.latestEnd - request.durationMinutes,
      request.preferredStart + 30,
    ),
  }));
  const cloneIds = new Set(source.map((request) => request.id));
  const cloneDemand: WorkforceDemand[] = baseInstance.workforceDemand
    .filter((row) => cloneIds.has(row.requestId))
    .map((row) => ({ ...row, requestId: `${row.requestId}${suffix}` }));
  return {
    ...baseInstance,
    requests: [...baseInstance.requests, ...clones],
    workforceDemand: [...baseInstance.workforceDemand, ...cloneDemand],
  };
}

/**
 * Adversarial: permitted windows tightened to a narrow band around each
 * requested time, so most requests have one or two legal starts and the
 * contention is maximal. This is where a greedy first-fit is most likely to
 * commit early and strand later work, and where an exact method should show its
 * advantage if it has one.
 */
function adversarialInstance(band: number): PlanningInstance {
  return {
    ...baseInstance,
    requests: baseInstance.requests.map((request) => {
      const earliest = Math.max(
        baseInstance.window.startMinute,
        request.preferredStart - band,
      );
      const latest = Math.min(
        baseInstance.window.endMinute,
        request.preferredStart + request.durationMinutes + band,
      );
      return {
        ...request,
        earliestStart: Math.max(request.earliestStart, earliest),
        latestEnd: Math.min(request.latestEnd, latest),
      };
    }),
  };
}

/**
 * Clone every second request rather than all of them.
 *
 * Cloning all 22 produced a 44-request night that neither method could satisfy:
 * the heuristic returned INFEASIBLE with 4 of 5 mandatory requests placed in
 * 173 ms, and CP-SAT exhausted a five-minute budget over 35 cut rounds and
 * 14,001 cuts without resolving it. That conflates "does not scale" with "is not
 * solvable". Half the clones keeps the instance feasible, so the fixture
 * measures scale on its own.
 */
const LARGER_CLONE_EVERY = 2;
const larger = withInstance(largerInstance(LARGER_CLONE_EVERY));
/**
 * 60 minutes of slack beyond each job's own duration.
 *
 * 30 was tried first and proved genuinely infeasible — the heuristic placed
 * 4 of 5 mandatory requests and CP-SAT proved no plan places all five. That is
 * a correct answer but a duplicate of the closed-block fixture. 60 keeps the
 * instance tight enough to punish early commitment while leaving mandatory work
 * placeable, so the two methods can be compared on quality rather than both
 * reporting infeasible.
 */
const ADVERSARIAL_BAND_MINUTES = 60;
const adversarial = withInstance(adversarialInstance(ADVERSARIAL_BAND_MINUTES));
const mandatoryRequest = baseInstance.requests.find((request) => request.mandatory)!;

/**
 * Planner pins, taken from a real heuristic solve so they are placements the
 * validator already accepts. Pinning invented times would make the fixture an
 * infeasibility test rather than a locked-input test.
 */
const pinnedSolve = solve({
  strategy: "max-completion",
  requests: baseInstance.requests,
  context: { world: baseWorld },
});
const pins: Placement[] = pinnedSolve.plan.placements
  .filter((placement) => !baseInstance.requests.find((r) => r.id === placement.requestId)?.mandatory)
  .slice(0, 3)
  .map((placement) => ({ ...placement, locked: true }));

const allFixtures: Fixture[] = [
  {
    name: "baseline-feasible",
    description: "The seeded fabricated night, 22 requests, unconstrained beyond its own rules.",
    instance: baseInstance,
    requests: baseInstance.requests,
    context: { world: baseWorld },
    locked: [],
  },
  {
    name: "mandatory-blocks-closed-infeasible",
    description: "Every block a mandatory request needs is out of service; no plan can exist.",
    instance: baseInstance,
    requests: baseInstance.requests,
    context: { world: baseWorld, closedBlockIds: mandatoryRequest.blockIds },
    locked: [],
  },
  {
    name: "shortened-window-disruption",
    description: "Handback pulled forward to minute 210, cutting 30 minutes off the night.",
    instance: baseInstance,
    requests: baseInstance.requests,
    context: { world: baseWorld, windowEnd: 210 },
    locked: [],
  },
  {
    name: "team-unavailable-disruption",
    description: "Power Systems Unit becomes unavailable from minute 120 onwards.",
    instance: baseInstance,
    requests: baseInstance.requests,
    context: {
      world: baseWorld,
      unavailableTeams: [{ teamId: "T-PWR", fromMinute: 120 }],
    },
    locked: [],
  },
  {
    name: "locked-planner-pins",
    description: `Three validated planner pins entered as hard constraints (${pins.map((p) => p.requestId).join(", ") || "none"}).`,
    instance: baseInstance,
    requests: baseInstance.requests,
    context: { world: baseWorld },
    locked: pins,
  },
  {
    name: "larger-cloned-night",
    description: `${larger.instance.requests.length} requests: the seeded night plus a non-mandatory clone set offset by 30 minutes.`,
    instance: larger.instance,
    requests: larger.instance.requests,
    context: { world: larger.world },
    locked: [],
  },
  {
    name: "adversarial-tight-windows",
    description: `Permitted windows squeezed to a ${ADVERSARIAL_BAND_MINUTES}-minute band around each requested time.`,
    instance: adversarial.instance,
    requests: adversarial.instance.requests,
    context: { world: adversarial.world },
    locked: [],
  },
];

const fixtures = only.length
  ? allFixtures.filter((fixture) => only.includes(fixture.name))
  : allFixtures;
if (!fixtures.length) {
  throw new Error(`No fixture matched ${only.join(", ")}. Known: ${allFixtures.map((f) => f.name).join(", ")}`);
}

// --- run --------------------------------------------------------------------

const results = fixtures.map((fixture) => {
  const heuristicOptions = {
    strategy: "max-completion" as const,
    requests: fixture.requests,
    context: fixture.context,
    locked: fixture.locked,
  };
  const heuristic = solve(heuristicOptions);
  // Determinism is a claim the engine makes about itself; check it rather than
  // repeat it. Same inputs must give the same placements and the same hash.
  const heuristicRepeat = solve(heuristicOptions);

  // Seed once: the cut derivation is deterministic TypeScript, so re-deriving
  // it for a repeat run would only re-measure the validator.
  const seed = seedFixture(fixture);
  const cpSat = benchmarkCpSat(fixture, seed);
  // Determinism for CP-SAT means the same model gives the same answer. Replaying
  // the whole lazy-cut loop would re-time the validator instead, and on the
  // larger fixture it doubled a five-minute budget for no extra information.
  // Re-solving the final cut set is the actual claim under test.
  const cpSatRepeat = cpSat.finalCuts
    ? runPython(fixture, seed.provenance, seed.candidates, cpSat.finalCuts)
    : null;

  const cpSatSummary = summarizePlan(cpSat.plan, fixture.requests, fixture.context);
  if (cpSatSummary && cpSatSummary.criticalViolations > 0) {
    throw new Error(
      `${fixture.name}: CP-SAT returned a plan with ${cpSatSummary.criticalViolations} critical violations; the harness must never report one.`,
    );
  }

  return {
    fixture: fixture.name,
    description: fixture.description,
    instanceDigest: instanceDigest(fixture.instance),
    requestCount: fixture.requests.length,
    lockedCount: fixture.locked.length,
    heuristic: {
      status: heuristic.status,
      solveMs: heuristic.solveMs,
      inputHash: heuristic.inputHash,
      deterministic:
        heuristic.inputHash === heuristicRepeat.inputHash &&
        planSignature(heuristic.plan) === planSignature(heuristicRepeat.plan),
      ...summarizePlan(heuristic.plan, fixture.requests, fixture.context),
    },
    cpSat: {
      status: cpSat.status,
      iterations: cpSat.iterations,
      candidates: cpSat.candidates,
      seededCuts: cpSat.seededCuts,
      validatorCuts: cpSat.cuts,
      cutSeedMs: cpSat.seedMs,
      pythonSolveMs: cpSat.pythonSolveMs,
      elapsedMs: cpSat.elapsedMs,
      objectiveValue: cpSat.objectiveValue,
      bestObjectiveBound: cpSat.bestObjectiveBound,
      // A proved-infeasible fixture has no plan to compare, so determinism is
      // the status agreeing. Comparing a null plan against an empty selection
      // reported a false negative here before this distinction was made.
      deterministic: !cpSatRepeat
        ? null
        : cpSatRepeat.status !== cpSat.status
          ? false
          : cpSat.plan === null
            ? cpSatRepeat.selected.length === 0
            : planSignature(cpSat.plan) ===
              planSignature({
                placements: cpSatRepeat.selected.map(
                  ({ requestId, startMinute, endMinute, teamId, locked }) => ({
                    requestId,
                    startMinute,
                    endMinute,
                    teamId,
                    locked,
                  }),
                ),
                deferred: [],
              }),
      ...cpSatSummary,
      ...("note" in cpSat && cpSat.note ? { note: cpSat.note } : {}),
    },
    solverProvenance: cpSat.solverProvenance,
  };
});

/** Taken from the solver's own echo rather than assumed by the caller. */
const solverVersions = results[0]?.solverProvenance;

console.log(JSON.stringify({
  benchmarkVersion: BENCHMARK_VERSION,
  constraintAuthority: `TypeScript validate() ${CONSTRAINT_VERSION}`,
  payloadSchema: PAYLOAD_SCHEMA,
  strategy: "max-completion",
  // Reproducibility: everything a reader needs to say whether their numbers
  // should match these, and why they might not.
  environment: {
    os: `${platform()} ${arch()}`,
    cpuModel: cpus()[0]?.model ?? "unknown",
    cpuCount: cpus().length,
    totalMemoryGiB: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    nodeVersion: process.version,
    pythonVersion: solverVersions?.pythonVersion ?? "unknown",
    ortoolsVersion: solverVersions?.ortoolsVersion ?? "unknown",
    cpSatModelVersion: solverVersions?.modelVersion ?? "unknown",
    timeLimitSeconds: TIME_LIMIT_SECONDS,
    randomSeed: RANDOM_SEED,
    searchWorkers: 1,
    slotMinutes: baseInstance.window.slotMinutes,
  },
  baselineInstanceDigest: instanceDigest(baseInstance),
  fixtureCount: fixtures.length,
  results,
}, null, 2));
