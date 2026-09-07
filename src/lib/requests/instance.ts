import type { PlanningInstance } from "@railplan/core/domain/instance";
/** JSON approval snapshots cannot carry relational foreign keys. Check all
 * assembled references before the engine sees baseline plus approved inputs;
 * absence from this selected-night pool also rejects cross-night predecessors. */
export function assertRequestReferences(instance: PlanningInstance): void {
  const ids = new Set(instance.requests.map((r) => r.id));
  const blocks = new Set(instance.blocks.map((b) => b.id));
  const teams = new Set(instance.teams.map((t) => t.id));
  const equipment = new Set(instance.equipment.map((e) => e.id));
  if (ids.size !== instance.requests.length)
    throw new Error("Duplicate planning request reference");
  for (const r of instance.requests) {
    if (!teams.has(r.teamId)) throw new Error("Unknown request team reference");
    if (!r.blockIds.length || r.blockIds.some((id) => !blocks.has(id)))
      throw new Error("Unknown request block reference");
    if (r.equipment.some((e) => !equipment.has(e.equipmentId)))
      throw new Error("Unknown request equipment reference");
    if (r.dependencies.some((id) => id === r.id || !ids.has(id)))
      throw new Error("Unknown or cross-night request dependency");
  }
}
