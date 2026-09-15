import type { UserRole } from "@railplan/core/types/auth";

const plannerPaths = new Set(["/plans", "/plans/history", "/plans/coordination", "/plans/deferred", "/requests", "/requests/drafts", "/sandbox", "/settings/notifications"]);
const contractorPaths = new Set(["/contractor", "/contractor/drafts"]);
const navigationKeys = new Set(["night", "planningNight", "plan", "request", "planRequest", "draft", "case", "work"]);

/** Navigation only: never retain arbitrary form contents or accept an external redirect. */
export function safeReturnTo(value: unknown, role?: UserRole): string {
  const fallback = role === "contractor" ? "/contractor" : role === "planner" ? "/plans" : "/";
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || /[\\\s]/.test(value)) return fallback;
  const path = value.split(/[?#]/, 1)[0];
  const allowed = role === "planner" ? plannerPaths : role === "contractor" ? contractorPaths : new Set([...plannerPaths, ...contractorPaths]);
  if (!allowed.has(path)) return fallback;
  const url = new URL(value, "https://railplan.invalid");
  const query = new URLSearchParams();
  for (const [key, entry] of url.searchParams) {
    if (navigationKeys.has(key) && /^[A-Za-z0-9-]{1,100}$/.test(entry) && !query.has(key)) query.set(key, entry);
  }
  return `${path}${query.size ? `?${query}` : ""}`;
}
