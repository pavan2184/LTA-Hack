"use client";
import Link from "next/link";
import type { UserRole } from "@railplan/core/types/auth";
import { RequestIntakeWorkspace } from "./RequestIntakeWorkspace";
import { TranscriptDraftWorkspace } from "./TranscriptDraftWorkspace";
import { CoordinationWorkspace } from "@/components/coordination/CoordinationWorkspace";
import { DeferredWorkWorkspace } from "@/components/deferred-work/DeferredWorkWorkspace";

export type RequestWorkspaceProps = {
  role: UserRole;
  planningNight?: string;
  planId?: string;
  planRequestId?: string;
  selectedRequestId?: string;
  selectedDraftId?: string;
  selectedCaseId?: string;
  selectedWorkId?: string;
  drafts?: boolean;
};

export function RequestWorkspaces({ role, planningNight, planId, planRequestId, selectedRequestId, selectedDraftId, selectedCaseId, selectedWorkId, drafts = false }: RequestWorkspaceProps) {
  const base = role === "planner" ? "/requests" : "/contractor";
  const context = new URLSearchParams();
  if (planningNight) context.set("planningNight", planningNight);
  if (planId) context.set("plan", planId);
  if (planRequestId) context.set("planRequest", planRequestId);
  const href = (path: string) => `${path}${context.size ? `?${context}` : ""}`;
  const overview = new URLSearchParams();
  if (planningNight) overview.set("night", planningNight);
  if (planId) overview.set("plan", planId);
  if (planRequestId) overview.set("request", planRequestId);
  return <>
    {role === "planner" && (planningNight || planId) && <Link className="workspace-back-link" href={`/plans?${overview}`}>Back to night overview</Link>}
    <nav className="workspace-tabs" aria-label="Request views">
      <Link href={href(base)} aria-current={!drafts ? "page" : undefined}>{role === "planner" ? "Request review" : "Your requests"}</Link>
      <Link href={href(`${base}/drafts`)} aria-current={drafts ? "page" : undefined}>Private transcript drafts</Link>
    </nav>
    {drafts ? <TranscriptDraftWorkspace role={role} manualIntake={role === "contractor"} selectedDraftId={selectedDraftId} requestHref={href(base)} /> :
      <RequestIntakeWorkspace role={role} planningNight={planningNight} selectedRequestId={selectedRequestId} />}
    {!drafts && role === "contractor" && <section id="coordination" className="mt-8 space-y-3 border-t border-rule pt-6">
      <div><h2 className="text-xl font-semibold">Schedule coordination</h2><p className="planner-muted">Review only your organisation’s affected requests and respond to proposed schedule changes.</p></div>
      <CoordinationWorkspace role="contractor" initialPlanningNight={planningNight} initialCaseId={selectedCaseId} />
    </section>}
    {!drafts && role === "contractor" && <section id="deferred-work" className="mt-8 space-y-3 border-t border-rule pt-6">
      <div><h2 className="text-xl font-semibold">Deferred work</h2><p className="planner-muted">Track your organisation’s postponed work and scheduling state across engineering nights.</p></div>
      <DeferredWorkWorkspace role="contractor" initialWorkId={selectedWorkId} initialPlanningNight={planningNight} />
    </section>}
  </>;
}
