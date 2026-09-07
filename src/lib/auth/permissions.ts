import type { UserRole } from "@railplan/core/types/auth";
export type PlannerAction = "assistant" | "solve" | "approve" | "publish" | "manage_resources";
export class AuthError extends Error {
  constructor(public readonly code: "unauthenticated" | "forbidden" | "auth_unavailable") {
    super(code);
  }
}
export function canPerform(role: UserRole, action: PlannerAction): boolean {
  return role === "planner" && ["assistant", "solve", "approve", "publish", "manage_resources"].includes(action);
}
export function requireAction(actor: { role: UserRole }, action: PlannerAction): void {
  if (!canPerform(actor.role, action)) throw new AuthError("forbidden");
}
