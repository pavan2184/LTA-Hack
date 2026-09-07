import { redirect } from "next/navigation";
import { SignOut } from "@/components/auth/SignOut";
import { workspaceActor } from "@/lib/auth/page";
export default async function Home() {
  const actor = await workspaceActor();
  if (!actor)
    return (
      <main className="mx-auto max-w-lg p-12">
        <h1 className="text-2xl font-semibold">Workspace access pending</h1>
        <p className="my-4">
          Your account is signed in, but a workspace administrator must assign
          your role before you can continue.
        </p>
        <SignOut />
      </main>
    );
  redirect(actor.role === "contractor" ? "/contractor" : "/plans");
}
