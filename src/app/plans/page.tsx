import Link from "next/link";
import { redirect } from "next/navigation";
import { workspaceActor } from "@/lib/auth/page";
import { SignOut } from "@/components/auth/SignOut";
import { SavedPlansWorkspace } from "@/components/plans/SavedPlansWorkspace";

export default async function SavedPlansPage() {
  const actor = await workspaceActor();
  if (!actor || actor.role !== "planner") redirect("/");
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs uppercase tracking-widest">RailPlan · Non-operational prototype</p><h1 className="mt-2 text-3xl font-semibold">Saved plans</h1></div>
      <div className="flex items-center gap-4 text-sm"><Link href="/" className="underline">Planning workspace</Link><SignOut /></div>
    </header>
    <SavedPlansWorkspace />
    <footer className="border-t border-rule pt-4 text-xs">Fabricated inputs. Not for operational decisions.</footer>
  </main>;
}
