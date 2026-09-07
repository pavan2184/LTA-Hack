import { redirect } from "next/navigation";
import { requireActor } from "./session";
import { AuthError } from "./permissions";
export async function workspaceActor() {
  try { return (await requireActor()).actor; }
  catch (error) {
    if (error instanceof AuthError && error.code === "unauthenticated") redirect("/login");
    if (error instanceof AuthError && error.code === "forbidden") return null;
    redirect("/login?error=unavailable");
  }
}
