import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import Home from "@/app/page";
import Sandbox from "@/app/sandbox/page";
// `Home` resolves who is asking through `landingAccess`, which distinguishes
// anonymous from unassigned so the bare domain can offer the open PS1 page.
// The sandbox still gates on `workspaceActor`, so both are mocked here.
const { actor, landing } = vi.hoisted(() => ({ actor: vi.fn(), landing: vi.fn() }));
vi.mock("@/lib/auth/page", () => ({ workspaceActor: actor, landingAccess: landing }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/components/auth/SignOut", () => ({
  SignOut: () => <button>Sign out</button>,
}));
vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: () => <div>Interactive conflict workspace</div>,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("provides planner journey links and marks the current workspace", () => {
  render(<WorkspaceNavigation role="planner" current="plans" />);
  expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Request review" })).toHaveAttribute(
    "href",
    "/requests",
  );
  expect(screen.getByRole("link", { name: "Coordination" })).toHaveAttribute(
    "href",
    "/plans/coordination",
  );
  expect(screen.getByRole("link", { name: "Night overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: "Demo sandbox" })).toHaveAttribute(
    "href",
    "/sandbox",
  );
  expect(
    screen.getByRole("link", { name: "Skip to workspace" }),
  ).toHaveAttribute("href", "#workspace");
});
it("links history and settings while retaining the selected night and saved version", () => {
  render(<WorkspaceNavigation role="planner" current="plans" planningNight="2026-09-16" planId="saved-version" requestId="M-001" />);
  expect(screen.getByRole("link", { name: "Plan history" })).toHaveAttribute("href", "/plans/history?night=2026-09-16&plan=saved-version&request=M-001");
  expect(screen.getByRole("link", { name: "Request review" })).toHaveAttribute("href", "/requests?planningNight=2026-09-16&plan=saved-version&planRequest=M-001");
  expect(screen.getByRole("link", { name: "Notification settings" })).toHaveAttribute("href", "/settings/notifications?night=2026-09-16&plan=saved-version&request=M-001");
  expect(screen.getByRole("link", { name: "Demo sandbox" })).toHaveAttribute("href", "/sandbox?night=2026-09-16&plan=saved-version&request=M-001");
  expect(screen.getByRole("link", { name: "Coordination" })).toHaveAttribute("href", "/plans/coordination?night=2026-09-16&plan=saved-version&request=M-001");
});
it("does not offer planner-wide workspaces to contractors", () => {
  render(<WorkspaceNavigation role="contractor" current="contractor" />);
  expect(screen.getByRole("link", { name: "Your requests" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(
    screen.queryByRole("link", { name: "Saved plans" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Demo sandbox" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Coordination" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "Contractor workspaces" })).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/", "/contractor"]);
  expect(screen.queryByRole("link", { name: "Notification settings" })).not.toBeInTheDocument();
});
it("offers the full workflow with planner actions on Home", async () => {
  landing.mockResolvedValue({ state: "workspace", actor: { role: "planner" } });
  render(await Home());
  expect(screen.getByRole("heading", { name: "How RailPlan works" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open night overview" })).toHaveAttribute("href", "/plans");
  expect(screen.getByRole("link", { name: "Prepare a private draft" })).toHaveAttribute("href", "/requests/drafts");
});
it("keeps contractor Home actions scoped while explaining the planner stages", async () => {
  landing.mockResolvedValue({ state: "workspace", actor: { role: "contractor" } });
  render(await Home());
  expect(screen.getByRole("heading", { name: "How RailPlan works" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open your requests" })).toHaveAttribute("href", "/contractor");
  expect(screen.getByRole("link", { name: "Prepare a private draft" })).toHaveAttribute("href", "/contractor/drafts");
  expect(screen.queryByRole("link", { name: "Open night overview" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Try the demo sandbox" })).not.toBeInTheDocument();
});
it("retains the selected engineering night through Home without forwarding arbitrary query data", async () => {
  landing.mockResolvedValue({ state: "workspace", actor: { role: "planner" } });
  render(await Home({ searchParams: Promise.resolve({ night: "2026-09-16", plan: "saved-version", request: "M-001", transcript: "private" }) }));
  expect(screen.getByRole("link", { name: "Open night overview" })).toHaveAttribute("href", "/plans?night=2026-09-16&plan=saved-version&request=M-001");
  expect(screen.getByRole("link", { name: "Review submitted requests" })).toHaveAttribute("href", "/requests?planningNight=2026-09-16&plan=saved-version&planRequest=M-001");
});
it("keeps unassigned identities at an explicit access-pending page", async () => {
  landing.mockResolvedValue({ state: "unassigned" });
  render(await Home());
  expect(
    screen.getByRole("heading", { name: "Workspace access pending" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Interactive conflict workspace"),
  ).not.toBeInTheDocument();
});
it("enforces planner access for the sandbox and labels its unsaved demo inputs", async () => {
  actor.mockResolvedValue({ role: "contractor" });
  await expect(Sandbox()).rejects.toThrow("redirect:/");
  actor.mockResolvedValue({ role: "planner" });
  render(await Sandbox());
  expect(
    screen.getByText(/Sandbox changes are exploratory/),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Interactive conflict workspace"),
  ).toBeInTheDocument();
});
it("returns from the sandbox to the exact saved selection without forwarding private query data", async () => {
  actor.mockResolvedValue({ role: "planner" });
  render(await Sandbox({ searchParams: Promise.resolve({
    night: "2026-09-16", plan: "saved-version", request: "M-001", transcript: "private",
  }) }));
  expect(screen.getByRole("link", { name: "Open Night overview" })).toHaveAttribute(
    "href", "/plans?night=2026-09-16&plan=saved-version&request=M-001",
  );
  expect(screen.getAllByRole("navigation", { name: "Planner workspaces" })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Demo sandbox" })).toHaveAttribute("aria-current", "page");
  const skipTarget = screen.getByRole("link", { name: "Skip to workspace" }).getAttribute("href");
  expect(document.querySelectorAll(skipTarget!)).toHaveLength(1);
  expect(document.querySelector(skipTarget!)).toHaveAttribute("tabindex", "-1");
});
