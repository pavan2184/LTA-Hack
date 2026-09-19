import { redirect } from "next/navigation";
import { workspaceActor } from "@/lib/auth/page";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SandboxSessionBoundary } from "@/components/layout/SandboxSessionBoundary";
import Link from "next/link";
import { safeReturnTo } from "@/lib/auth/return-path";
export default async function Sandbox({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams ?? {};
  const query = new URLSearchParams(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const returnTo = safeReturnTo(`/sandbox?${query}`, "planner");
  const params = new URL(returnTo, "https://railplan.invalid").searchParams;
  const actor = await workspaceActor(returnTo);
  if (!actor || actor.role !== "planner") redirect("/");
  return (
    <>
      <WorkspaceNavigation role="planner" current="sandbox" planningNight={params.get("night")} planId={params.get("plan")} requestId={params.get("request")} />
      <section
        id="workspace"
        tabIndex={-1}
        aria-label="Demo sandbox"
        className="min-w-0"
      >
        <p className="border-b border-rule bg-signal-amber-soft px-4 py-3 text-sm">
          Sandbox changes are exploratory and use fabricated demo requests. They
          do not change approved requests or saved plans. <Link href={`/plans${params.size ? `?${params}` : ""}`} className="font-semibold text-accent underline">Open Night overview</Link> to
          generate, publish and export approved planning inputs.
        </p>
        <SandboxSessionBoundary key={actor.id} actorId={actor.id}>
          <DashboardShell />
        </SandboxSessionBoundary>
      </section>
    </>
  );
}
