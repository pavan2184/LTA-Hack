"use server";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/auth/server";

export async function login(form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || email.length > 320 || !password || password.length > 1024) redirect("/login?error=credentials");
  let failure = false;
  try {
    const client = await createAuthClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    failure = Boolean(error);
  } catch { redirect("/login?error=unavailable"); }
  if (failure) redirect("/login?error=credentials");
  redirect("/");
}
export async function logout() {
  try {
    const client = await createAuthClient();
    const { error } = await client.auth.signOut();
    if (error) redirect("/login?error=unavailable");
  } catch { redirect("/login?error=unavailable"); }
  redirect("/login");
}
