import type { PlanExport } from "@railplan/core/types/exports";

export type PlanChangeKind =
  | "added"
  | "removed"
  | "moved"
  | "reassigned"
  | "revised"
  | "deferral"
  | "lock";
export interface PlanRequestChange {
  requestId: string;
  title: string;
  kinds: PlanChangeKind[];
  before: string;
  after: string;
  changedFacts: string[];
}

// Object insertion order is not a saved fact; array order is retained.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
function state(plan: PlanExport, id: string) {
  const placement = plan.placements.find((row) => row.requestId === id);
  if (placement)
    return `${placement.startMinute}–${placement.endMinute} min · ${placement.teamId}${placement.locked ? " · pinned" : ""}`;
  const deferred = plan.deferrals.find((row) => row.requestId === id);
  return deferred
    ? `Deferred: ${deferred.reason} (${deferred.bindingRuleIds.join(", ")})`
    : "Absent from schedule";
}

/** Compare only persisted facts/output. No solve, source refresh, or writes. */
export function comparePlans(base: PlanExport, target: PlanExport) {
  if (base.provenance.planningNight !== target.provenance.planningNight)
    throw new Error("Choose two versions of the same engineering night.");
  const ids = [
    ...new Set(
      [...base.facts.requests, ...target.facts.requests]
        .map((r) => r.id)
        .concat(
          [
            ...base.placements,
            ...target.placements,
            ...base.deferrals,
            ...target.deferrals,
          ].map((r) => r.requestId),
        ),
    ),
  ].sort();
  const changes: PlanRequestChange[] = [];
  for (const requestId of ids) {
    const before = base.facts.requests.find((r) => r.id === requestId);
    const after = target.facts.requests.find((r) => r.id === requestId);
    const bp = base.placements.find((r) => r.requestId === requestId);
    const tp = target.placements.find((r) => r.requestId === requestId);
    const bd = base.deferrals.find((r) => r.requestId === requestId);
    const td = target.deferrals.find((r) => r.requestId === requestId);
    const kinds: PlanChangeKind[] = [];
    if ((!bp && tp) || (!before && after)) kinds.push("added");
    if ((bp && !tp) || (before && !after)) kinds.push("removed");
    if (
      bp &&
      tp &&
      (bp.startMinute !== tp.startMinute || bp.endMinute !== tp.endMinute)
    )
      kinds.push("moved");
    if (bp && tp && bp.teamId !== tp.teamId) kinds.push("reassigned");
    if (bp && tp && bp.locked !== tp.locked) kinds.push("lock");
    const changedFacts =
      before && after
        ? [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
            (key) =>
              canonical(before[key as keyof typeof before]) !==
              canonical(after[key as keyof typeof after]),
          )
        : [];
    const demand = (p: PlanExport) =>
      p.facts.workforceDemand
        .filter((r) => r.requestId === requestId)
        .sort((a, b) => a.roleId.localeCompare(b.roleId));
    if (
      before &&
      after &&
      canonical(demand(base)) !== canonical(demand(target))
    )
      changedFacts.push("workforceDemand");
    if (changedFacts.length) kinds.push("revised");
    if (
      bd &&
      td &&
      (bd.reason !== td.reason ||
        canonical(bd.bindingRuleIds) !== canonical(td.bindingRuleIds))
    )
      kinds.push("deferral");
    if (kinds.length)
      changes.push({
        requestId,
        title: after?.title ?? before?.title ?? requestId,
        kinds,
        before: state(base, requestId),
        after: state(target, requestId),
        changedFacts,
      });
  }
  const metrics = Object.entries(base.metrics).map(([key, before]) => {
    const after = target.metrics[key as keyof typeof target.metrics];
    return {
      key,
      label: after.label,
      unit: after.unit,
      before: before.value,
      after: after.value,
      delta: after.value - before.value,
    };
  });
  return { changes, metrics };
}
