import Link from "next/link";
import type { ReactNode } from "react";
import type { UserRole } from "@railplan/core/types/auth";
import { SignOut } from "@/components/auth/SignOut";

type Workspace = "home" | "requests" | "plans" | "coordination" | "deferred" | "sandbox" | "contractor" | "history" | "settings";
export function WorkspaceNavigation({
  role,
  current,
  planningNight,
  planId,
  requestId,
  accountControl,
}: {
  role: UserRole;
  current: Workspace;
  planningNight?: string | null;
  planId?: string | null;
  requestId?: string | null;
  accountControl?: ReactNode;
}) {
  const destination = (path: string) => {
    const query = new URLSearchParams();
    if (planningNight) query.set(path === "/requests" ? "planningNight" : "night", planningNight);
    if (planId) query.set("plan", planId);
    if (requestId) query.set(path === "/requests" ? "planRequest" : "request", requestId);
    return `${path}${query.size ? `?${query}` : ""}`;
  };
  const links: { id: Workspace; title: string; href: string }[] =
    role === "planner"
      ? [
          { id: "home", title: "Home", href: destination("/") },
          { id: "plans", title: "Night overview", href: destination("/plans") },
          { id: "coordination", title: "Coordination", href: destination("/plans/coordination") },
          { id: "deferred", title: "Deferred work", href: destination("/plans/deferred") },
          { id: "requests", title: "Request review", href: destination("/requests") },
          { id: "history", title: "Plan history", href: destination("/plans/history") },
          { id: "sandbox", title: "Demo sandbox", href: destination("/sandbox") },
        ]
      : [{ id: "home", title: "Home", href: "/" }, { id: "contractor", title: "Your requests", href: "/contractor" }];
  return (
    <header className="workspace-header">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:inline-block focus:p-3 focus:outline-2 focus:outline-accent"
      >
        Skip to workspace
      </a>
      <div className="workspace-header-inner">
        <Link className="workspace-brand" href={role === "planner" ? destination("/") : "/"}>RailPlan</Link>
        <nav
          aria-label={`${role === "planner" ? "Planner" : "Contractor"} workspaces`}
          className="workspace-nav"
        >
          {links.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              aria-current={current === link.id ? "page" : undefined}
              className="workspace-nav-link"
            >
              {link.title}
            </Link>
          ))}
        </nav>
        <div className="workspace-account">
          <span className="workspace-prototype">Prototype</span>
          {role === "planner" && <Link className="workspace-settings" href={destination("/settings/notifications")} aria-current={current === "settings" ? "page" : undefined}>Notification settings</Link>}
          {accountControl ?? <SignOut />}
        </div>
      </div>
    </header>
  );
}
