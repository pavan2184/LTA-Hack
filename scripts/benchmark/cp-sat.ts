import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { buildWorld } from "@railplan/core/domain/world";
import { computeMetrics } from "@railplan/core/engine/metrics";
import { solve } from "@railplan/core/engine/solve";
import {
  isFeasible,
  validate,
  type ValidationContext,
} from "@railplan/core/engine/validate";
import type {
  MaintenanceRequest,
  Plan,
  Placement,
} from "@railplan/core/types/railplan";

type Candidate = Placement & {
  key: string;
  priorityWeight: number;
};

type PythonResult = {
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
  requests: MaintenanceRequest[];
  context: ValidationContext;
  locked: Placement[];
};

const priorityWeight = { low: 1, medium: 2, high: 4, critical: 8 } as const;
const python = process.argv[2] || process.env.RAILPLAN_PYTHON || "python";
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

function runPython(requests: MaintenanceRequest[], candidates: Candidate[], cuts: string[][]) {
  const payload = {
    requests: requests.map((request) => ({ id: request.id, mandatory: request.mandatory })),
    candidates,
    cuts,
    timeLimitSeconds: 10,
  };
  const run = spawnSync(python, [pythonScript], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    env: process.env,
  });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(run.stderr || run.stdout || `Python exited ${run.status}`);
  const parsed = JSON.parse(run.stdout) as PythonResult;
  if (parsed.error) throw new Error(`${parsed.error}: ${parsed.message}`);
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

  for (let left = 0; left < candidates.length; left += 1) {
    const first = candidates[left];
    for (let right = left + 1; right < candidates.length; right += 1) {
      const second = candidates[right];
      if (first.requestId === second.requestId) continue;
      const firstRequest = fixture.requests.find((request) => request.id === first.requestId)!;
      const secondRequest = fixture.requests.find((request) => request.id === second.requestId)!;
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

function benchmarkCpSat(fixture: Fixture) {
  const candidates = candidatesFor(fixture);
  const cuts: string[][] = [];
  const seenCuts = new Set<string>();
  let pythonSeconds = 0;
  let result: PythonResult | null = null;
  const started = performance.now();

  for (const cut of seedValidatorCuts(fixture, candidates)) {
    const normalized = [...new Set(cut)].sort();
    const key = normalized.join("|");
    if (!normalized.length || seenCuts.has(key)) continue;
    seenCuts.add(key);
    cuts.push(normalized);
  }

  for (let iteration = 1; iteration <= 1_000; iteration += 1) {
    result = runPython(fixture.requests, candidates, cuts);
    pythonSeconds += result.wallTimeSeconds;
    if (!["OPTIMAL", "FEASIBLE"].includes(result.status)) {
      return {
        status: result.status,
        plan: null,
        validation: [],
        iterations: iteration,
        cuts: cuts.length,
        pythonSolveMs: Math.round(pythonSeconds * 100_000) / 100,
        elapsedMs: Math.round((performance.now() - started) * 100) / 100,
        objectiveValue: result.objectiveValue,
        bestObjectiveBound: result.bestObjectiveBound,
      };
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
      return {
        status: result.status,
        plan,
        validation,
        iterations: iteration,
        cuts: cuts.length,
        pythonSolveMs: Math.round(pythonSeconds * 100_000) / 100,
        elapsedMs: Math.round((performance.now() - started) * 100) / 100,
        objectiveValue: result.objectiveValue,
        bestObjectiveBound: result.bestObjectiveBound,
      };
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
  throw new Error(`${fixture.name}: exceeded validator-cut limit`);
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
    criticalViolations: validation.filter((violation) => violation.severity === "critical").length,
  };
}

const instance = buildInstanceFromLiterals();
const world = buildWorld(instance);
const mandatory = instance.requests.find((request) => request.mandatory)!;
const fixtures: Fixture[] = [
  { name: "baseline-feasible", requests: instance.requests, context: { world }, locked: [] },
  {
    name: "mandatory-blocks-closed-infeasible",
    requests: instance.requests,
    context: { world, closedBlockIds: mandatory.blockIds },
    locked: [],
  },
  {
    name: "shortened-window-disruption",
    requests: instance.requests,
    context: { world, windowEnd: 210 },
    locked: [],
  },
];

const results = fixtures.map((fixture) => {
  const heuristic = solve({
    strategy: "max-completion",
    requests: fixture.requests,
    context: fixture.context,
    locked: fixture.locked,
  });
  const cpSat = benchmarkCpSat(fixture);
  return {
    fixture: fixture.name,
    heuristic: {
      status: heuristic.status,
      solveMs: heuristic.solveMs,
      ...summarizePlan(heuristic.plan, fixture.requests, fixture.context),
    },
    cpSat: {
      status: cpSat.status,
      iterations: cpSat.iterations,
      validatorCuts: cpSat.cuts,
      pythonSolveMs: cpSat.pythonSolveMs,
      elapsedMs: cpSat.elapsedMs,
      objectiveValue: cpSat.objectiveValue,
      bestObjectiveBound: cpSat.bestObjectiveBound,
      ...summarizePlan(cpSat.plan, fixture.requests, fixture.context),
    },
  };
});

console.log(JSON.stringify({
  benchmarkVersion: "railplan-cp-sat-reference-v1",
  constraintAuthority: "TypeScript validate() constraints-v3",
  strategy: "max-completion",
  slotMinutes: instance.window.slotMinutes,
  requestCount: instance.requests.length,
  results,
}, null, 2));
