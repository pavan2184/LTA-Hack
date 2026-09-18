import { redirect } from "next/navigation";
import type { Actor } from "@railplan/core/types/auth";
import { requireActor } from "./session";
import { AuthError } from "./permissions";
import { safeReturnTo } from "./return-path";

export type LandingAccess =
  | { state: "anonymous" }
  | { state: "unassigned" }
  | { state: "workspace"; actor: Actor };

/**
 * Who is at the landing page, without ever redirecting them away from it.
 *
 * `/` is the one route someone reaches by typing the bare domain, so it has to
 * render for a visitor with no account — and on a deployment with no Supabase
 * credentials at all, where verifying identity throws before it can answer. Any
 * failure that is not a recognised profile is treated as "not signed in", which
 * shows the public entry rather than an error page. Routes that touch data
 * still go through `workspaceActor`, which fails closed as before.
 */
export async function landingAccess(): Promise<LandingAccess> {
  try {
    return { state: "workspace", actor: (await requireActor()).actor };
  } catch (error) {
    if (error instanceof AuthError && error.code === "forbidden") return { state: "unassigned" };
    return { state: "anonymous" };
  }
}
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
