import { redirect } from "next/navigation";
import { requireActor } from "./session";
import { AuthError } from "./permissions";
import { safeReturnTo } from "./return-path";
export async function workspaceActor(returnTo?: string) {
  const destination = safeReturnTo(returnTo);
  const query = destination !== "/" ? `?returnTo=${encodeURIComponent(destination)}` : "";
  try { return (await requireActor()).actor; }
  catch (error) {
    if (error instanceof AuthError && error.code === "unauthenticated") redirect(`/login${query}`);
    if (error instanceof AuthError && error.code === "forbidden") return null;
    redirect(`/login?error=unavailable${query ? `&${query.slice(1)}` : ""}`);
  }
}
