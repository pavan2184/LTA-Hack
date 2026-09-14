import { redirect } from "next/navigation";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { RequestWorkspaces } from "@/components/requests/RequestWorkspaces";
import { workspaceActor } from "@/lib/auth/page";

export default async function RequestReviewPage() {
  const actor = await workspaceActor();
  if (!actor || actor.role !== "planner") redirect("/");
  return (
    <>
      <WorkspaceNavigation role="planner" current="requests" />
      <main
        id="workspace"
        tabIndex={-1}
        className="mx-auto max-w-6xl space-y-6 px-4 py-8"
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest">
              RailPlan · Non-operational prototype
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Request review</h1>
          </div>
        </header>
        <p className="text-sm text-ink-700">
          Review submitted requests and their source evidence. Approval makes
          the request available for scheduling; later changes require a
          new plan.
        </p>
        <RequestWorkspaces role="planner" />
        <footer className="border-t border-rule pt-4 text-xs">
          Fabricated inputs. Not for operational decisions.
        </footer>
      </main>
    </>
  );
}
