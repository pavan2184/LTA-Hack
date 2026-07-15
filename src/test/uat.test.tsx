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

    fireEvent.click(screen.getByRole("button", { name: /load sample requests/i }));
    expect(screen.getByText("18 / 22")).toBeInTheDocument();
    expect(screen.getAllByText(/6 declared conflicts/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /open M-014/i }));
    expect(screen.getByText(/Team Alpha was assigned to M-008/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /resolve conflicts/i }));
    await act(() => vi.advanceTimersByTimeAsync(1100));
    expect(screen.getByText("21 / 22")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/planning objective/i), { target: { value: "min-risk" } });
    expect(screen.getByText("20 / 22")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /test disruption/i }));
    expect(screen.getByRole("heading", { name: /simulate operational disruption/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /apply disruption/i }));
    expect(screen.getByText(/emergency possession conflicts with two scheduled jobs/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /replan affected work/i }));
    await act(() => vi.advanceTimersByTimeAsync(900));
    expect(screen.getAllByText(/response plan prepared/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/emergency request accommodated/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^all$/i }));
    fireEvent.click(screen.getByRole("button", { name: /open M-014/i }));
    fireEvent.click(screen.getByRole("button", { name: /^lock request$/i }));
    expect(screen.getByRole("button", { name: /unlock request/i })).toBeInTheDocument();
  });
});
