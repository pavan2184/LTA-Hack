import type { HardViolation, OccupancyRow, Ps1Instance } from "../types/ps1";
import { buildNetwork, closureFor, expandSpan, type Network } from "./network";

/** Constraint provenance, distinct from the unchanged penalty formula version. */
export const CLOSURE_MODEL_VERSION = "ps1-closure-v1";

export interface ClosureConflict {
  sourceId: string;
  targetId: string;
  locations: string[];
  kind?: "buffer";
}

/**
 * Directed closure/occupied-span intersections, independent of a schedule.
 * Non-Live PC/C and C/C pairs are buffer-free. Live protection applies to every
 * access type; C work can also exclude a PM through its own Consist buffer.
 * This interpretation reproduces the reported organiser rejection and accepts
 * the published sample; it is not a copy of the organiser's validator.
 */
export function closureConflicts(
  instance: Ps1Instance,
  network: Network = buildNetwork(instance),
): ClosureConflict[] {
  const contracts = new Map(instance.contracts.map((contract) => [contract.contractNumber, contract]));
  const spans = new Map(instance.activities.map((activity) => [activity.activityId,
    expandSpan(network, activity.startLocationId, activity.endLocationId)]));
  const closures = new Map(instance.activities.map((activity) => [activity.activityId,
    new Set(closureFor(network, spans.get(activity.activityId)!, contracts.get(activity.contractNumber)!.natureOfActivity))]));
  const conflicts: ClosureConflict[] = [];
  for (const source of instance.activities) {
    const contract = contracts.get(source.contractNumber)!;
    const closed = closures.get(source.activityId)!;
    for (const target of instance.activities) {
      if (target.activityId === source.activityId) continue;
      const targetContract = contracts.get(target.contractNumber)!;
      // Official §2.1 makes PC/C buffer-free. Live power isolation overrides
      // that compatibility: the observed A074 rejection includes C activities.
      if (contract.natureOfActivity !== "Live" && targetContract.natureOfActivity !== "Live" &&
        contract.accessType !== "PM" && targetContract.accessType !== "PM" &&
        (contract.accessType === "C" || targetContract.accessType === "C")) continue;
      const locations = spans.get(target.activityId)!.filter((id) => closed.has(id));
      if (locations.length) {
        conflicts.push({ sourceId: source.activityId, targetId: target.activityId, locations });
      } else if ((network.bufferByNature.get(contract.natureOfActivity)?.sectors ?? 0) > 0 &&
        (network.bufferByNature.get(targetContract.natureOfActivity)?.sectors ?? 0) > 0 &&
        !spans.get(source.activityId)!.some((id) => closures.get(target.activityId)!.has(id))) {
        // The published hard rule also prohibits overlapping host buffers even
        // when neither worksite itself enters the other host's closure.
        const overlap = [...closures.get(target.activityId)!].filter((id) => closed.has(id));
        if (overlap.length) conflicts.push({ sourceId: source.activityId, targetId: target.activityId,
          locations: overlap, kind: "buffer" });
      }
    }
  }
  return conflicts;
}

/**
 * A possession component is connected by actual equal location/week/group
 * rows. Reusing b1 at unrelated locations does not create an exemption. Legal
 * mixes and capacity still apply at each individual location, not globally.
 */
export function findClosureViolations(
  occupancy: OccupancyRow[],
  conflicts: ClosureConflict[],
): HardViolation[] {
  const weeks = new Map<number, OccupancyRow[]>();
  for (const row of occupancy) {
    const rows = weeks.get(row.week) ?? [];
    rows.push(row);
    weeks.set(row.week, rows);
  }
  const violations: HardViolation[] = [];
  for (const [week, rows] of [...weeks].sort(([a], [b]) => a - b)) {
    const parent = new Map<string, string>();
    const root = (id: string): string => {
      if (!parent.has(id)) parent.set(id, id);
      let current = id;
      while (parent.get(current)! !== current) current = parent.get(current)!;
      const result = current;
      current = id;
      while (parent.get(current)! !== current) {
        const next = parent.get(current)!;
        parent.set(current, result);
        current = next;
      }
      return result;
    };
    const groups = new Map<string, string>();
    for (const row of rows) {
      const key = JSON.stringify([row.locationId, row.coShareGroup]);
      const first = groups.get(key);
      if (first === undefined) {
        groups.set(key, row.activityId);
        root(row.activityId);
      } else {
        parent.set(root(row.activityId), root(first));
      }
    }
    for (const conflict of conflicts) {
      if (!parent.has(conflict.sourceId) || !parent.has(conflict.targetId) ||
        root(conflict.sourceId) === root(conflict.targetId)) continue;
      const locations = conflict.locations.slice(0, 4).map((id) => `'${id}'`).join(", ");
      violations.push({ rule: "closure", severity: "hard",
        detail: conflict.kind === "buffer"
          ? `wk${week}: buffers of ${conflict.sourceId} and ${conflict.targetId} overlap at [${locations}]`
          : `wk${week}: ${conflict.targetId} inside closure of ['${conflict.sourceId}'] at [${locations}]` });
    }
  }
  return violations;
}
