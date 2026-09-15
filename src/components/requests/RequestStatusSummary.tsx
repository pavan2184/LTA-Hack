import type { RequestSubmission, RequestStatus } from "@railplan/core/types/requests";
import type { UserRole } from "@railplan/core/types/auth";
import Link from "next/link";
import { readableTime } from "./ClockTimeField";

const titles: Record<RequestStatus, string> = {
  draft: "Draft — not submitted", submitted: "Awaiting planner review",
  needs_info: "Changes requested", approved: "Approved for planning",
  rejected: "Rejected", cancelled: "Cancelled",
};
const nextSteps: Record<RequestStatus, [string, string]> = {
  draft: ["Complete the work details, then submit for review.", "Complete the work details with the contractor, then submit for review. Approval is a separate step."],
  submitted: ["A planner needs to review this submission. No new slot is confirmed by submission alone.", "Review the proposed work and scheduling fields below, then approve or request changes."],
  needs_info: ["Update the requested information and resubmit for planner review.", "Correct the requested information with the contractor, then resubmit for review."],
  approved: ["Approval makes this work eligible for planning; check the published slot separately below.", "Open the engineering night to schedule this approved work, then review publication."],
  rejected: ["Read the decision reason. Start a revision if you want to propose corrected work.", "The contractor may start a revision and submit corrected work."],
  cancelled: ["This request is cancelled. Start a revision if the work is still needed.", "The request is cancelled; no new work should be scheduled from it."],
};

export function RequestStatusSummary({ request, role }: { request: RequestSubmission; role: UserRole }) {
  const decision = request.history.filter((event) => event.toStatus === request.status && event.reason)
    .sort((a, b) => b.version - a.version)[0];
  return <section aria-label="Request status and next step" className="my-4 rounded border border-accent/25 bg-accent-soft p-4 text-sm space-y-2">
    <h3 className="font-semibold">{titles[request.status]} · Revision {request.version}</h3>
    <p><strong>Next step: </strong>{nextSteps[request.status][role === "contractor" ? 0 : 1]}</p>
    {role === "planner" && request.status === "approved" && <Link className="planner-link inline-block" href={`/plans?${new URLSearchParams({ night: request.fields.planningNight, request: `R-${request.id}` })}`}>Continue to scheduling →</Link>}
    {decision && ["needs_info", "rejected"].includes(request.status) && <p><strong>Decision reason: </strong>{decision.reason}</p>}
    {request.activeApprovedRevision !== null && <p>Approved revision {request.activeApprovedRevision} remains the planning input until it is replaced or cancelled.</p>}
    {request.scheduled ? <p><strong>Published slot is for revision {request.scheduled.revision}: </strong>{readableTime(request.scheduled.startMinute)}–{readableTime(request.scheduled.endMinute)}. {request.scheduled.revision !== request.version && "It does not confirm this newer revision."}</p>
      : <p>No published slot is recorded for this request.</p>}
    {role === "planner" && request.scheduled && <Link className="planner-link inline-block" href={`/plans?${new URLSearchParams({ night: request.revisions.find((revision) => revision.version === request.scheduled!.revision)?.fields.planningNight ?? request.fields.planningNight, plan: request.scheduled.planId, request: `R-${request.id}` })}`}>Open published plan</Link>}
    <p className="text-xs text-ink-500">Publication and notification delivery are separate. This prototype is not an operational instruction.</p>
  </section>;
}
