import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { useRailPlanStore } from "@/store/useRailPlanStore";

describe("two-minute RailPlan demo UAT", () => {
  beforeEach(() => {
    localStorage.clear();
    useRailPlanStore.setState({ selectedStrategy: "balanced", lockedRequestIds: [], lockedPlacements: {} });
    useRailPlanStore.getState().resetDemo();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("completes optimisation, risk strategy, disruption, replanning, and human lock control", async () => {
    render(<DashboardShell />);

    fireEvent.click(screen.getByRole("button", { name: /load demo/i }));
    expect(screen.getByText("18 / 22")).toBeInTheDocument();
    expect(screen.getAllByText(/6 active conflicts/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /open M-014/i }));
    expect(screen.getByText(/Team Alpha was assigned to M-008/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /optimise schedule/i }));
    await act(() => vi.advanceTimersByTimeAsync(1100));
    expect(screen.getByText("21 / 22")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/optimisation strategy/i), { target: { value: "min-risk" } });
    expect(screen.getByText("20 / 22")).toBeInTheDocument();
    expect(screen.getByText("93 / 100")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /simulate disruption/i }));
    expect(screen.getByRole("heading", { name: /simulate operational disruption/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /apply disruption/i }));
    expect(screen.getByText(/emergency possession conflicts with two scheduled jobs/i)).toBeInTheDocument();
    expect(screen.getByText("51 / 100")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /replan schedule/i }));
    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(screen.getByText(/response plan validated/i)).toBeInTheDocument();
    expect(screen.getAllByText(/emergency request accommodated/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /open M-014/i }));
    fireEvent.click(screen.getByRole("button", { name: /^lock request$/i }));
    expect(screen.getByRole("button", { name: /unlock request/i })).toBeInTheDocument();
  });
});
