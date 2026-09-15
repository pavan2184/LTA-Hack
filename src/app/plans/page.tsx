import Link from "next/link";
import { redirect } from "next/navigation";
import { workspaceActor } from "@/lib/auth/page";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { SavedPlansWorkspace } from "@/components/plans/SavedPlansWorkspace";

export default async function SavedPlansPage() {
  const actor = await workspaceActor();
  if (!actor || actor.role !== "planner") redirect("/");
  return (
    <>
      <WorkspaceNavigation role="planner" current="plans" />
      <main
        id="workspace"
        tabIndex={-1}
        className="mx-auto max-w-[1720px] space-y-6 px-4 py-8"
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest">
              RailPlan · Non-operational prototype
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Plan the night</h1>
          </div>
          <Link
            href="/sandbox"
            className="text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Try with demo data
          </Link>
        </header>
        <p className="text-sm text-ink-700">
          Build a draft, review the jobs and any unscheduled work, then publish the schedule.
        </p>
        <SavedPlansWorkspace />
        <footer className="border-t border-rule pt-4 text-xs">
          Fabricated inputs. Not for operational decisions.
        </footer>
      </main>
    </>
  );
}
