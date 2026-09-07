import { redirect } from "next/navigation";
import { SignOut } from "@/components/auth/SignOut";
import { workspaceActor } from "@/lib/auth/page";
export default async function Contractor() {
  const actor = await workspaceActor();
  if (!actor || actor.role !== "contractor") redirect("/");
  return <main className="mx-auto max-w-2xl p-8"><div className="mb-12 flex items-center justify-between"><p className="text-sm">RailPlan · Contractor workspace</p><SignOut /></div>
    <h1 className="mb-4 text-3xl font-semibold">Your organisation workspace</h1>
    <p className="mb-4">You are signed in as a contractor. Maintenance request intake is being developed and is not available yet.</p>
    <p className="text-sm">Fabricated-data prototype. Not for operational use.</p>
  </main>;
}
