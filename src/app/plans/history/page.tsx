import { redirect } from "next/navigation";
import Link from "next/link";
import { workspaceActor } from "@/lib/auth/page";
import { safeReturnTo } from "@/lib/auth/return-path";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { PlanHistory } from "@/components/plans/PlanHistory";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const query = new URLSearchParams(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const returnTo = safeReturnTo(`/plans/history?${query}`, "planner");
  const params = new URL(returnTo, "https://railplan.invalid").searchParams;
  const actor = await workspaceActor(returnTo);
  if (!actor || actor.role !== "planner") redirect("/");
  const night = params.get("night") ?? undefined;
  const planId = params.get("plan") ?? undefined;
  const requestId = params.get("request") ?? undefined;
  return <><WorkspaceNavigation role="planner" current="history" planningNight={night} planId={planId} requestId={requestId} /><main id="workspace" tabIndex={-1} className="workspace-page"><header><h1>Plan history</h1><p>Review saved versions and open their original facts, calculations and publication status.</p><Link className="planner-link" href={`/plans${params.size ? `?${params}` : ""}`}>← Back to night overview</Link></header><PlanHistory key={night ?? "default"} night={night} planId={planId} requestId={requestId} /></main></>;
}
