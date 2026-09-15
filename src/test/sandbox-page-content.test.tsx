import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { useRailPlanStore } from "@/store/useRailPlanStore";

afterEach(cleanup);
beforeEach(async () => {
  localStorage.clear();
  useRailPlanStore.getState().reset();
  await act(async () => useRailPlanStore.getState().load());
});

it("combines the shared queue, timeline, inspector and calculations in one sandbox", () => {
  render(<DashboardShell />);
  expect(screen.getByRole("heading", { name: "Engineering timeline" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Work requests" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Request details" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Calculated metrics" })).toBeInTheDocument();
  expect(screen.getByText("Ask about this plan", { selector: "summary" })).toBeInTheDocument();
});
it("keeps workforce compact and scenarios accessible without a second page", () => {
  render(<DashboardShell />);
  expect(within(document.getElementById("sandbox-resources")!).getByRole("button", { name: /Workforce availability/ })).toHaveAttribute("aria-expanded", "false");
  expect(within(document.getElementById("sandbox-scenarios")!).getByRole("button", { name: "Test a disruption" })).toBeInTheDocument();
});
it("shows deferred work explicitly and never offers sandbox publication", async () => {
  await act(async () => useRailPlanStore.getState().buildPlan());
  render(<DashboardShell />);
  expect(screen.getByText("Deferred for review")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /publish/i })).not.toBeInTheDocument();
});
