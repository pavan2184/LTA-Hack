import { redirect } from "next/navigation";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { DeferredWorkWorkspace } from "@/components/deferred-work/DeferredWorkWorkspace";
import { workspaceActor } from "@/lib/auth/page";

type Query = Record<string, string | string[] | undefined>;
export default async function DeferredWorkPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : undefined;
  const retained = new URLSearchParams();
  for (const key of ["work", "night", "plan", "request"]) {
    const entry = value(key);
    if (entry) retained.set(key, entry);
  }
  const actor = await workspaceActor(`/plans/deferred${retained.size ? `?${retained}` : ""}`);
  if (!actor || actor.role !== "planner") redirect("/");
  return <>
    <WorkspaceNavigation role="planner" current="deferred" planningNight={value("night")} planId={value("plan")} requestId={value("request")} />
    <main id="workspace" tabIndex={-1} className="workspace-page mx-auto max-w-7xl space-y-6 px-4 py-8">
      <header><p className="workspace-eyebrow">RailPlan · Planner workspace</p><h1 className="mt-2 text-3xl font-semibold">Deferred-work backlog</h1><p>Track postponed work across engineering nights, assign accountability and record lifecycle decisions.</p></header>
      <DeferredWorkWorkspace role="planner" initialWorkId={value("work")} initialPlanningNight={value("night")} returnPlanId={value("plan")} returnRequestId={value("request")} />
      <footer className="border-t border-rule pt-4 text-xs">Fabricated inputs. Not for operational decisions.</footer>
    </main>
  </>;
}
