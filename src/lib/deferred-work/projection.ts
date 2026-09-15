import type { PlannerWorkItem, WorkItemFlags } from "@railplan/core/types/deferred-work";
/** Events are chronological; a later publication can correct one night only. */
export function effectiveDeferredNights(events: readonly { night: string; kind: "deferred" | "scheduled" }[]): string[] {
  const nights = new Set<string>();
  for (const event of events) {
    if (event.kind === "deferred") nights.add(event.night);
    else nights.delete(event.night);
  }
  return [...nights].sort();
}
/** Both arguments use explicit Singapore calendar dates, without a hidden clock. */
export function workItemFlags(item: Pick<PlannerWorkItem, "state" | "dueDate" | "ownerId" | "repeatThreshold" | "effectiveDeferredNights" | "proposedNight">, today: string): WorkItemFlags {
  const unresolved = item.state === "open" || item.state === "scheduled";
  return {
    overdue: unresolved && item.dueDate !== null && item.dueDate < today,
    repeated: unresolved && new Set(item.effectiveDeferredNights).size >= item.repeatThreshold,
    missingDueDate: item.dueDate === null,
    missingOwner: item.ownerId === null,
    awaitingTargetNightReview: unresolved && item.proposedNight !== null,
  };
}
