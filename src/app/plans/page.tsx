import { redirect } from "next/navigation";
import { workspaceActor } from "@/lib/auth/page";
import { SavedPlansWorkspace } from "@/components/plans/SavedPlansWorkspace";
import { SignOut } from "@/components/auth/SignOut";

export default async function SavedPlansPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const params = await searchParams ?? {};
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const actor = await workspaceActor(`/plans${query.size ? `?${query}` : ""}`);
  if (!actor || actor.role !== "planner") redirect("/");
  return <SavedPlansWorkspace accountControl={<SignOut />} />;
}
