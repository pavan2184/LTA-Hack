import { login } from "./actions";
import { authConfig } from "@/lib/auth/config";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  let configured = true;
  try { authConfig(); } catch { configured = false; }
  const message = !configured || error === "unavailable" ? "Sign-in is unavailable. Contact your workspace administrator." : error === "credentials" ? "Unable to sign in. Check your email and password." : null;
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
    <p className="mb-3 text-xs uppercase tracking-widest">RailPlan · Non-operational prototype</p>
    <h1 className="mb-3 text-3xl font-semibold">Sign in to your workspace</h1>
    <p className="mb-7 text-sm">Use your provisioned planner or contractor account. Access is assigned by your workspace administrator.</p>
    {message && <p role="alert" className="mb-5 rounded border border-red-300 p-3 text-sm">{message}</p>}
    <form action={login} className="flex flex-col gap-4">
      <label className="text-sm">Email<input name="email" type="email" autoComplete="username" maxLength={320} required className="mt-1 block w-full rounded border bg-white p-3" /></label>
      <label className="text-sm">Password<input name="password" type="password" autoComplete="current-password" maxLength={1024} required className="mt-1 block w-full rounded border bg-white p-3" /></label>
      <button disabled={!configured} className="rounded bg-slate-900 px-4 py-3 text-white disabled:opacity-50" type="submit">Sign in</button>
    </form>
    <p className="mt-6 text-xs">Fabricated planning data. This prototype is not for operational use.</p>
  </main>;
}
