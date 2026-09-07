import { redirect } from "next/navigation";
import { workspaceActor } from "@/lib/auth/page";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
export default async function Sandbox() {
  const actor = await workspaceActor();
  if (!actor || actor.role !== "planner") redirect("/");
  return (
    <>
      <WorkspaceNavigation role="planner" current="sandbox" />
      <section
        id="workspace"
        tabIndex={-1}
        aria-label="Demo sandbox"
        className="min-w-0"
      >
        <p className="border-b border-rule bg-signal-amber-soft px-4 py-3 text-sm">
          Sandbox changes are exploratory and use fabricated demo requests. They
          do not change approved requests or saved plans. Use Saved plans to
          generate, publish and export approved planning inputs.
        </p>
        <DashboardShell />
      </section>
    </>
  );
}
