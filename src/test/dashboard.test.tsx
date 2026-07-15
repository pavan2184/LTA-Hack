import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { useRailPlanStore } from "@/store/useRailPlanStore";

describe("RailPlan dashboard", () => {
  beforeEach(() => {
    localStorage.clear();
    useRailPlanStore.setState({ selectedStrategy: "balanced", lockedRequestIds: [], lockedPlacements: {} });
    useRailPlanStore.getState().resetDemo();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads the demo and opens a selected request explanation", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);

    await user.click(screen.getByRole("button", { name: /load demo/i }));
    expect(screen.getByText("18 / 22")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open M-014/i }));
    expect(screen.getByRole("heading", { name: /signalling equipment inspection/i })).toBeInTheDocument();
    expect(screen.getByText(/Team Alpha was assigned to M-008/i)).toBeInTheDocument();
  });

  it("uses a restrained four-metric overview below the plan heading", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);

    await user.click(screen.getByRole("button", { name: /load demo/i }));

    expect(screen.getByRole("heading", { name: /overnight maintenance plan/i })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Schedule summary metrics")).getAllByRole("article")).toHaveLength(4);
  });

  it("optimises the schedule and updates metrics", async () => {
    vi.useFakeTimers();
    render(<DashboardShell />);
    fireEvent.click(screen.getByRole("button", { name: /load demo/i }));
    fireEvent.click(screen.getByRole("button", { name: /optimise schedule/i }));

    expect(screen.getByText(/Evaluating 22 maintenance requests/i)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1100));

    expect(screen.getByText("21 / 22")).toBeInTheDocument();
    expect(screen.getAllByText(/No active conflicts detected/i).length).toBeGreaterThan(0);
  });

  it("lets a planner lock a request", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await user.click(screen.getByRole("button", { name: /load demo/i }));
    await user.click(screen.getByRole("button", { name: /open M-014/i }));
    await user.click(screen.getByRole("button", { name: /^lock request$/i }));

    expect(screen.getByRole("button", { name: /unlock request/i })).toBeInTheDocument();
    expect(useRailPlanStore.getState().lockedRequestIds).toContain("M-014");
  });
});
