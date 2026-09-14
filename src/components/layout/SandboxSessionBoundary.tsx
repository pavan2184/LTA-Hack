"use client";

import { useEffect, type ReactNode } from "react";

import { useRailPlanStore } from "@/store/useRailPlanStore";

/** Clears user-authored transient controls when this tab changes planners. */
export function SandboxSessionBoundary({
  actorId,
  children,
}: {
  actorId: string;
  children: ReactNode;
}) {
  const beginSandboxSession = useRailPlanStore(
    (state) => state.beginSandboxSession,
  );
  const sandboxActorId = useRailPlanStore((state) => state.sandboxActorId);

  useEffect(() => {
    beginSandboxSession(actorId);
  }, [actorId, beginSandboxSession]);

  // Never paint one planner's in-memory controls or assistant conversation
  // beneath another planner's server-confirmed identity. The effect clears the
  // transient slice, then this boundary reveals the requested page.
  if (sandboxActorId !== actorId) return null;

  return children;
}
