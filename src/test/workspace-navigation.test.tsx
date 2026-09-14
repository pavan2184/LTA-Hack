import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import Home from "@/app/page";
import SandboxLayout from "@/app/sandbox/layout";
const { actor } = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock("@/lib/auth/page", () => ({ workspaceActor: actor }));
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
  expect(screen.getByRole("link", { name: "Request review" })).toHaveAttribute(
    "href",
    "/requests",
  );
  expect(screen.getByRole("link", { name: "Saved plans" })).toHaveAttribute(
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
});
it("lands planners in saved planning and contractors in scoped intake", async () => {
  actor.mockResolvedValue({ role: "planner" });
  await expect(Home()).rejects.toThrow("redirect:/plans");
  actor.mockResolvedValue({ role: "contractor" });
  await expect(Home()).rejects.toThrow("redirect:/contractor");
});
it("keeps unassigned identities at an explicit access-pending page", async () => {
  actor.mockResolvedValue(null);
  render(await Home());
  expect(
    screen.getByRole("heading", { name: "Workspace access pending" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Interactive conflict workspace"),
  ).not.toBeInTheDocument();
});
it("enforces planner access for the sandbox and labels its unsaved demo inputs", async () => {
  actor.mockResolvedValue({ id: "contractor-one", role: "contractor" });
  await expect(
    SandboxLayout({ children: <div>Overview page</div> }),
  ).rejects.toThrow("redirect:/");
  actor.mockResolvedValue({ id: "planner-one", role: "planner" });
  render(await SandboxLayout({ children: <div>Overview page</div> }));
  expect(
    screen.getByText(/Sandbox changes are exploratory/),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Interactive conflict workspace"),
  ).toBeInTheDocument();
});
