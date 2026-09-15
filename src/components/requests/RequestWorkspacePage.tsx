import { redirect } from "next/navigation";
import type { UserRole } from "@railplan/core/types/auth";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { workspaceActor } from "@/lib/auth/page";
import { RequestWorkspaces } from "./RequestWorkspaces";

export type RequestQuery = Record<string, string | string[] | undefined>;
export async function RequestWorkspacePage({ role, drafts = false, searchParams }: {
  role: UserRole;
  drafts?: boolean;
  searchParams: Promise<RequestQuery>;
}) {
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : undefined;
  const context = new URLSearchParams();
  for (const key of ["planningNight", "plan", "planRequest", drafts ? "draft" : "request"]) {
    const entry = value(key);
    if (entry) context.set(key, entry);
  }
  const selectedCaseId = role === "contractor" && !drafts ? value("case") : undefined;
  if (selectedCaseId) context.set("case", selectedCaseId);
  const selectedWorkId = role === "contractor" && !drafts ? value("work") : undefined;
  if (selectedWorkId) context.set("work", selectedWorkId);
  const base = role === "planner" ? "/requests" : "/contractor";
  const route = `${base}${drafts ? "/drafts" : ""}${context.size ? `?${context}` : ""}`;
  const actor = await workspaceActor(route);
  if (!actor || actor.role !== role) redirect("/");
  const title = drafts ? "Private transcript drafts" : role === "planner" ? "Request review" : "Your organisation’s requests";
  const description = drafts
    ? "Turn meeting notes into private request proposals, check the details, then submit them for review."
    : role === "planner"
      ? "Create requests for contractor organisations, or review submitted work and approve its scheduling details before it enters an engineering night’s plan."
      : "Create and submit maintenance requests, respond to review feedback and track your organisation’s published work slots.";
  return <>
    <WorkspaceNavigation role={role} current={role === "planner" ? "requests" : "contractor"} planningNight={value("planningNight")} planId={value("plan")} requestId={value("planRequest")} />
    <main id="workspace" tabIndex={-1} className="workspace-page mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header><p className="workspace-eyebrow">RailPlan · {role === "planner" ? "Planner" : "Contractor"} workspace</p><h1 className="mt-2 text-3xl font-semibold">{title}</h1><p>{description}</p></header>
      <RequestWorkspaces role={role} drafts={drafts} planningNight={value("planningNight")} planId={value("plan")} planRequestId={value("planRequest")} selectedRequestId={value("request")} selectedDraftId={value("draft")} selectedCaseId={selectedCaseId} selectedWorkId={selectedWorkId} />
      <footer className="border-t border-rule pt-4 text-xs">Fabricated inputs. Not for operational decisions.</footer>
    </main>
  </>;
}
