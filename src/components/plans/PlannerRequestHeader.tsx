import type { ReactNode } from "react";
import type { MaintenanceRequest, Placement } from "@railplan/core/types/railplan";
import { formatClock } from "@railplan/core/engine/intervals";

/** Shared presentation only: each workspace owns its data and permissions. */
export function PlannerRequestHeader({ request, placement, deferred, plannedLabel = "Planned", children }: {
  request: MaintenanceRequest;
  placement?: Placement;
  deferred: boolean;
  plannedLabel?: string;
  children?: ReactNode;
}) {
  return <>
    <h3>{request.title}</h3>
    <p className="planner-muted" style={{ overflowWrap: "anywhere", marginTop: 8 }}>{request.id} · {request.sector}</p>
    {children}
    <div className="planner-inspector-section planner-times">
      <div><span className="planner-muted">Requested</span><strong>{formatClock(request.preferredStart)}</strong><span className="planner-muted">to {formatClock(request.preferredStart + request.durationMinutes)}</span></div>
      <div><span className="planner-muted">{plannedLabel}</span><strong>{placement ? formatClock(placement.startMinute) : deferred ? "Deferred" : "Unscheduled"}</strong>{placement && <span className="planner-muted">to {formatClock(placement.endMinute)}</span>}</div>
    </div>
    <p className="planner-muted" style={{ marginTop: 13 }}>{request.durationMinutes} min work · {request.clearanceMinutes} min clearance</p>
  </>;
}
