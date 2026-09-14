import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { SandboxSessionBoundary } from "@/components/layout/SandboxSessionBoundary";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { workspaceActor } from "@/lib/auth/page";

export default async function SandboxLayout({ children }: { children: ReactNode }) {
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
        <SandboxSessionBoundary actorId={actor.id}>
          <DashboardShell>{children}</DashboardShell>
        </SandboxSessionBoundary>
      </section>
    </>
  );
}
