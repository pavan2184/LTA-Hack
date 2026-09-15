import Link from "next/link";
import type { UserRole } from "@railplan/core/types/auth";
import { SignOut } from "@/components/auth/SignOut";

type Workspace = "requests" | "plans" | "sandbox" | "contractor";
export function WorkspaceNavigation({
  role,
  current,
}: {
  role: UserRole;
  current: Workspace;
}) {
  const links: { id: Workspace; title: string; href: string }[] =
    role === "planner"
      ? [
          { id: "requests", title: "Request review", href: "/requests" },
          { id: "plans", title: "Schedule", href: "/plans" },
          { id: "sandbox", title: "Demo sandbox", href: "/sandbox" },
        ]
      : [{ id: "contractor", title: "Your requests", href: "/contractor" }];
  return (
    <div className="border-b border-rule bg-surface">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:inline-block focus:p-3 focus:outline-2 focus:outline-accent"
      >
        Skip to workspace
      </a>
      <div className="mx-auto flex max-w-[1720px] flex-wrap items-center gap-3 px-4 py-3">
        <span className="text-sm font-semibold">RailPlan</span>
        <nav
          aria-label={`${role === "planner" ? "Planner" : "Contractor"} workspaces`}
          className="flex min-w-0 flex-wrap gap-2 text-sm"
        >
          {links.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              aria-current={current === link.id ? "page" : undefined}
              className="rounded px-3 py-2 underline underline-offset-4 hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-[current=page]:bg-accent-soft aria-[current=page]:font-semibold"
            >
              {link.title}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <SignOut />
        </div>
      </div>
    </div>
  );
}
