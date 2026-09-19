import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const access = vi.fn();
vi.mock("@/lib/auth/page", () => ({ landingAccess: access }));
vi.mock("@/components/auth/SignOut", () => ({ SignOut: () => <button>Sign out</button> }));
vi.mock("@/components/layout/WorkspaceNavigation", () => ({
  WorkspaceNavigation: () => <nav />,
}));
afterEach(() => vi.clearAllMocks());

/**
 * The bare domain is the only address a judge is given, and it used to answer
 * with a password box for a scheduler that needs no password. Everything else
 * in this build is unreachable if that regresses, so it is worth a test that
 * does not depend on anyone remembering to check.
 */
it("offers the open scheduler to a visitor with no account", async () => {
  access.mockResolvedValue({ state: "anonymous" });
  const Home = (await import("@/app/page")).default;
  render(await Home());

  const scheduler = screen.getByRole("link", { name: /Open the PS1 scheduler/ });
  expect(scheduler).toHaveAttribute("href", "/ps1");
  expect(screen.getByRole("link", { name: /Sign in to the workspace/ })).toHaveAttribute(
    "href",
    "/login",
  );
  expect(screen.getByText(/No sign-in required/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Explore the interactive CP-SAT lab/ })).toHaveAttribute(
    "href", "/algorithm-lab",
  );
  expect(screen.getByRole("heading", { name: "How CP-SAT works" })).toBeInTheDocument();
  // No password field: the landing offers the door, it is not the door.
  expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
});

it("still points a signed-in account with no role at the open scheduler", async () => {
  access.mockResolvedValue({ state: "unassigned" });
  const Home = (await import("@/app/page")).default;
  render(await Home());

  expect(screen.getByText("Workspace access pending")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /PS1 track access scheduler/ })).toHaveAttribute(
    "href",
    "/ps1",
  );
});

it("gives a planner the workspace rather than the public entry", async () => {
  access.mockResolvedValue({ state: "workspace", actor: { role: "planner" } });
  const Home = (await import("@/app/page")).default;
  render(await Home());

  expect(screen.getByRole("heading", { name: "How RailPlan works" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Open the PS1 scheduler/ })).not.toBeInTheDocument();
});
