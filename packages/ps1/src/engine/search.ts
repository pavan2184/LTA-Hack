import { ACTIVITY_NUDGE, CONTRACT_WEIGHT, type Ps1Instance, type Submission } from "../types/ps1";
import { closureFor, expandSpan, type Network } from "./network";
import type { Pin, ScheduleOptions } from "./schedule";
import { validate, weekOf } from "./validate";

/** Derive ECLO impact from the same closure expansion used by the checker. */
function linesFor(instance: Ps1Instance, network: Network): Map<string, string[]> {
  const contracts = new Map(instance.contracts.map((c) => [c.contractNumber, c]));
  return new Map(instance.activities.map((a) => [a.activityId, [...new Set(closureFor(
    network, expandSpan(network, a.startLocationId, a.endLocationId),
    contracts.get(a.contractNumber)!.natureOfActivity,
  ).map((id) => network.supply.get(id)!.lineCode))]]));
}

/** Ranked beam of window choices; singleton and unused windows fit a pair too. */
export function windowCandidates(instance: Ps1Instance, network: Network, pins: Pin[]): Record<string, number>[] {
  const lines = linesFor(instance, network);
  const contracts = new Map(instance.contracts.map((c) => [c.contractNumber, c]));
  let beam: { windows: Record<string, number>; value: number }[] = [{ windows: {}, value: 0 }];
  for (const line of network.lineCodes) {
    const choices: { start: number; value: number }[] = [];
    for (let start = 1; start <= Math.max(1, instance.parameters.horizonWeeks - 1); start += 1) {
      if (pins.some((p) => p.eclo === 1 && lines.get(p.activityId)?.includes(line) &&
        (p.week < start || p.week > start + 1))) continue;
      let value = 0;
      for (const a of instance.activities) {
        if (!lines.get(a.activityId)!.includes(line) || a.totalAccesses < 2) continue;
        const c = contracts.get(a.contractNumber)!;
        const release = Math.max(1, weekOf(instance.parameters.horizonStart, a.plannedStartDate));
        const due = weekOf(instance.parameters.horizonStart, c.plannedCompletionDate);
        const overlap = Math.max(0, Math.min(start + 1, due) - Math.max(start, release) + 1);
        // Rank urgent windows, but leave all choices available for small horizons.
        value += overlap * CONTRACT_WEIGHT[c.contractPriority] * (1 + ACTIVITY_NUDGE[a.activityPriority]) *
          (a.totalAccesses >= due - release + 1 ? 2 : 1);
      }
      choices.push({ start, value });
    }
    beam = beam.flatMap((entry) => choices.map((choice) => ({
      windows: { ...entry.windows, [line]: choice.start }, value: entry.value + choice.value,
    }))).sort((a, b) => b.value - a.value || JSON.stringify(a.windows).localeCompare(JSON.stringify(b.windows)))
      .slice(0, 256);
  }
  return beam.map((entry) => entry.windows);
}

function incumbentWindows(instance: Ps1Instance, network: Network, submission: Submission): Record<string, number> {
  const lines = linesFor(instance, network);
  const windows: Record<string, number> = {};
  for (const row of submission.access) {
    if (!row.eclo) continue;
    for (const line of lines.get(row.activityId) ?? []) {
      windows[line] = Math.min(windows[line] ?? row.week, row.week);
    }
  }
  return windows;
}

type Candidate = { submission: Submission; score: number };

/**
 * Adaptive destroy/repair. Freeze unaffected activity-weeks; reconstruct groups
 * and contract-night assignments afresh. Dependencies remain topologically
 * ordered and every accepted candidate is checked by the caller. A seeded
 * annealing walk can escape a local minimum without replacing the best result.
 */
export function searchRepairs(
  instance: Ps1Instance, network: Network, options: ScheduleOptions,
  initial: Submission, budget: number, expired: () => boolean,
  evaluate: (options: ScheduleOptions) => Candidate | undefined,
): void {
  const contracts = new Map(instance.contracts.map((c) => [c.contractNumber, c]));
  const activities = new Map(instance.activities.map((a) => [a.activityId, a]));
  const spans = new Map(instance.activities.map((a) => [a.activityId,
    new Set(expandSpan(network, a.startLocationId, a.endLocationId))]));
  let randomState = (options.optimizationBudget?.seed ?? 1) >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  let current: Candidate = { submission: initial,
    score: validate(instance, initial, network, options.disruptions ?? []).objectiveScore! };
  let bestScore = current.score;
  const weights = [1, 1, 1, 1]; // late chain, shared location, contract, random segment
  for (let iteration = 0; iteration < budget && !expired() && bestScore > 0; iteration += 1) {
    let draw = random() * weights.reduce((sum, weight) => sum + weight, 0);
    let operator = 0;
    while (operator < weights.length - 1 && (draw -= weights[operator]) > 0) operator += 1;
    const last = new Map<string, number>();
    for (const row of current.submission.access) last.set(row.activityId, Math.max(last.get(row.activityId) ?? 0, row.week));
    const ranked = [...instance.activities].sort((a, b) => {
      const urgency = (id: string) => {
        const activity = activities.get(id)!;
        const c = contracts.get(activity.contractNumber)!;
        return Math.max(0, (last.get(id) ?? 0) - weekOf(instance.parameters.horizonStart, c.plannedCompletionDate)) *
          CONTRACT_WEIGHT[c.contractPriority] * (1 + ACTIVITY_NUDGE[activity.activityPriority]);
      };
      return urgency(b.activityId) - urgency(a.activityId) || a.activityId.localeCompare(b.activityId);
    });
    const target = ranked[Math.floor(random() * Math.max(1, Math.ceil(ranked.length / 4)))];
    if (!target) return;
    const removed = new Set<string>([target.activityId]);
    const size = Math.max(2, Math.ceil(instance.activities.length * (0.1 + random() * 0.2)));
    const shuffled = instance.activities.map((a) => ({ a, key: random() })).sort((a, b) => a.key - b.key);
    if (operator === 0) {
      let cursor = target;
      while (cursor.predecessorActivityId) {
        removed.add(cursor.predecessorActivityId);
        cursor = activities.get(cursor.predecessorActivityId)!;
      }
    }
    for (const { a } of shuffled) {
      if (removed.size >= size) break;
      if (operator === 3 || (operator === 2 && a.contractNumber === target.contractNumber) ||
        (operator === 1 && [...spans.get(a.activityId)!].some((id) => spans.get(target.activityId)!.has(id))) ||
        (operator === 0 && ranked.indexOf(a) < size)) removed.add(a.activityId);
    }
    // Moving a predecessor can force all downstream starts to move too.
    let grew = true;
    while (grew) {
      grew = false;
      for (const a of instance.activities) if (a.predecessorActivityId && removed.has(a.predecessorActivityId) && !removed.has(a.activityId)) {
        removed.add(a.activityId);
        grew = true;
      }
    }
    const pins = [...(options.pins ?? [])];
    for (const row of current.submission.access) {
      if (!removed.has(row.activityId) && !pins.some((p) => p.activityId === row.activityId && p.week === row.week)) {
        pins.push({ activityId: row.activityId, week: row.week, eclo: row.eclo });
      }
    }
    const proposal = evaluate({ ...options, pins,
      activityOrder: shuffled.map(({ a }) => a.activityId).filter((id) => removed.has(id)),
      constructionSeed: iteration % 6,
      nominalCapacity: options.scenario !== "A" && iteration % 3 === 0,
      ecloWindows: options.scenario === "C" ? incumbentWindows(instance, network, current.submission) : undefined,
    });
    let reward = 0;
    if (proposal) {
      const temperature = Math.max(1, initial.access.length / 10) * (1 - iteration / Math.max(1, budget));
      const improvement = current.score - proposal.score;
      if (improvement >= 0 || random() < Math.exp(improvement / Math.max(0.01, temperature))) {
        current = proposal;
        reward = improvement > 0 ? 3 : 1;
      }
      if (proposal.score < bestScore) { bestScore = proposal.score; reward = 6; }
    }
    weights[operator] = Math.max(0.2, weights[operator] * 0.8 + reward * 0.2);
  }
}
