import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOut } from "@/components/auth/SignOut";
import { RequestWorkspaces } from "@/components/requests/RequestWorkspaces";
import { workspaceActor } from "@/lib/auth/page";

export default async function RequestReviewPage() {
  const actor = await workspaceActor();
  if (!actor || actor.role !== "planner") redirect("/");
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest">
            RailPlan · Non-operational prototype
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Request review</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/" className="underline">
            Planning workspace
          </Link>
          <Link href="/plans" className="underline">
            Saved plans
          </Link>
          <SignOut />
        </div>
      </header>
      <RequestWorkspaces role="planner" />
      <footer className="border-t border-rule pt-4 text-xs">
        Fabricated inputs. Not for operational decisions.
      </footer>
    </main>
  );
}
