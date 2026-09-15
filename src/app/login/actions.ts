"use server";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/auth/server";
import { safeReturnTo } from "@/lib/auth/return-path";
import { workspaceActor } from "@/lib/auth/page";

export async function login(form: FormData) {
  const returnTo = safeReturnTo(form.get("returnTo"));
  const failed = (code: string) => `/login?error=${code}${returnTo !== "/" ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`;
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || email.length > 320 || !password || password.length > 1024) redirect(failed("credentials"));
  let failure = false;
  try {
    const client = await createAuthClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    failure = Boolean(error);
  } catch { redirect(failed("unavailable")); }
  if (failure) redirect(failed("credentials"));
  const actor = await workspaceActor(returnTo);
  redirect(actor ? safeReturnTo(returnTo, actor.role) : "/");
}
export async function logout() {
  try {
    const client = await createAuthClient();
    const { error } = await client.auth.signOut();
    if (error) redirect("/login?error=unavailable");
  } catch { redirect("/login?error=unavailable"); }
  redirect("/login");
}
