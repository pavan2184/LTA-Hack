import { redirect } from "next/navigation";
import Link from "next/link";
import { workspaceActor } from "@/lib/auth/page";
import { safeReturnTo } from "@/lib/auth/return-path";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const query = new URLSearchParams(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const returnTo = safeReturnTo(`/settings/notifications?${query}`, "planner");
  const params = new URL(returnTo, "https://railplan.invalid").searchParams;
  const actor = await workspaceActor(returnTo);
  if (!actor || actor.role !== "planner") redirect("/");
  return <><WorkspaceNavigation role="planner" current="settings" planningNight={params.get("night")} planId={params.get("plan")} requestId={params.get("request")} /><main id="workspace" tabIndex={-1} className="workspace-page"><header><h1>Notification settings</h1><p>Manage contractor delivery destinations. Saving settings does not send a message.</p><Link className="planner-link" href={`/plans${params.size ? `?${params}` : ""}`}>← Back to night overview</Link></header><NotificationSettings /></main></>;
}
