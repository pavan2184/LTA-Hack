import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/auth/return-path";

type Section = "requests" | "conflicts" | "schedule" | "resources" | "scenarios";
export async function redirectSandboxSection(
  section: Section,
  searchParams?: Promise<Record<string, string | string[] | undefined>>,
): Promise<never> {
  const raw = await searchParams ?? {};
  const query = new URLSearchParams();
  for (const key of ["night", "plan", "request"]) {
    const value = raw[key];
    if (typeof value === "string") query.set(key, value);
  }
  redirect(safeReturnTo(`/sandbox?${query}`, "planner") + `#sandbox-${section}`);
}
