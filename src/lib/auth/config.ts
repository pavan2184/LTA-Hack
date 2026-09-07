import { AuthError } from "./permissions";
export function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new AuthError("auth_unavailable");
  try { new URL(url); } catch { throw new AuthError("auth_unavailable"); }
  return { url, key };
}
