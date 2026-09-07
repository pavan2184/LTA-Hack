import { redirect } from "next/navigation";
import { SignOut } from "@/components/auth/SignOut";
import { workspaceActor } from "@/lib/auth/page";
import { RequestWorkspaces } from "@/components/requests/RequestWorkspaces";
export default async function Contractor() {
  const actor = await workspaceActor();
  if (!actor || actor.role !== "contractor") redirect("/");
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest">
            RailPlan · Contractor workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            Your organisation’s requests
          </h1>
        </div>
        <SignOut />
      </header>
      <RequestWorkspaces role="contractor" />
      <footer className="border-t border-rule pt-4 text-xs">
        Fabricated inputs. Not for operational decisions.
      </footer>
    </main>
  );
}
