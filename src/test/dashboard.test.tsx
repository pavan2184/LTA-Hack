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

    await user.click(screen.getByRole("button", { name: /load sample requests/i }));
    expect(screen.getByText("18 / 22")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open M-014/i }));
    expect(screen.getByRole("heading", { name: /signalling equipment inspection/i })).toBeInTheDocument();
    expect(screen.getByText(/Team Alpha was assigned to M-008/i)).toBeInTheDocument();
    expect(screen.getByText(/affected corridor/i)).toBeInTheDocument();
  });

  it("uses four planner-facing decision signals and a readiness checklist", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);

    await user.click(screen.getByRole("button", { name: /load sample requests/i }));

    expect(screen.getByRole("heading", { name: /overnight engineering plan/i })).toBeInTheDocument();
    const signals = within(screen.getByLabelText("Schedule summary metrics"));
    expect(signals.getAllByRole("article")).toHaveLength(4);
    expect(signals.getByText("Jobs placed")).toBeInTheDocument();
    expect(signals.getByText("Critical work")).toBeInTheDocument();
    expect(signals.getByText("Declared conflicts")).toBeInTheDocument();
    expect(signals.getByText("Window load")).toBeInTheDocument();
    expect(screen.getByLabelText("Plan release readiness")).toBeInTheDocument();
    expect(screen.queryByLabelText("Robustness radar chart")).not.toBeInTheDocument();
  });

  it("puts attention, conflict resolution, and direct issue review first", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);

    await user.click(screen.getByRole("button", { name: /load sample requests/i }));

    expect(screen.getByRole("button", { name: /^attention$/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/planning objective/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^submitted$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^recommended$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resolve conflicts/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open conflict concurrent access on NS10–NS12/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export schedule/i })).not.toBeInTheDocument();
  });

  it("optimises the schedule and updates metrics", async () => {
    vi.useFakeTimers();
    render(<DashboardShell />);
    fireEvent.click(screen.getByRole("button", { name: /load sample requests/i }));
    fireEvent.click(screen.getByRole("button", { name: /resolve conflicts/i }));

    expect(screen.getByText(/Evaluating 22 maintenance requests/i)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1100));

    expect(screen.getByText("21 / 22")).toBeInTheDocument();
    expect(screen.getAllByText(/0 declared conflicts/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ready for planner review/i).length).toBeGreaterThan(0);
  });

  it("lets a planner lock a request", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await user.click(screen.getByRole("button", { name: /load sample requests/i }));
    await user.click(screen.getByRole("button", { name: /open M-014/i }));
    await user.click(screen.getByRole("button", { name: /^lock request$/i }));

    expect(screen.getByRole("button", { name: /unlock request/i })).toBeInTheDocument();
    expect(useRailPlanStore.getState().lockedRequestIds).toContain("M-014");
  });
});
