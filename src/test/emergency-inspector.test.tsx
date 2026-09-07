import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { RequestInspector } from "@/components/insights/RequestInspector";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import { requestById } from "@railplan/core/data/requests";

describe("emergency request inspector", () => {
  beforeEach(async () => {
    localStorage.clear();
    useRailPlanStore.getState().reset();
    useRailPlanStore.setState({ strategy: "balanced" });
    await useRailPlanStore.getState().load();
  });

  function expectEmergencyDetails() {
    expect(screen.getByRole("heading", { name: "Emergency track fault inspection" })).toBeInTheDocument();
    expect(screen.getByText("EM-001")).toBeInTheDocument();
    expect(screen.getByText("mandatory")).toBeInTheDocument();
    expect(screen.getByText("02:00-03:00")).toBeInTheDocument();
    expect(screen.getByText("NS12-NS13, NS13-NS14")).toBeInTheDocument();
    expect(screen.getByText("Rapid Response (T-RRT)")).toBeInTheDocument();
    expect(screen.getByText("Technician: 2; Supervisor: 1")).toBeInTheDocument();
    expect(screen.getByText(/scenario fixes this mandatory request/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pin|apply/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Alternative slots")).not.toBeInTheDocument();
    expect(screen.queryByText(/every option here was inserted/i)).not.toBeInTheDocument();
  }

  it("shows the exact forced placement and explicit staffing before and after replanning, then clears it", async () => {
    useRailPlanStore.getState().triggerDisruption("track-fault");
    useRailPlanStore.getState().selectRequest("EM-001");
    expect(useRailPlanStore.getState().submitted!.plan.placements.some((p) => p.requestId === "EM-001")).toBe(false);
    render(<RequestInspector />);
    expectEmergencyDetails();

    await act(async () => useRailPlanStore.getState().replan());
    expect(useRailPlanStore.getState().hasReplanned).toBe(true);
    act(() => useRailPlanStore.getState().selectRequest("EM-001"));
    expectEmergencyDetails();

    await act(async () => useRailPlanStore.getState().clearDisruption());
    act(() => useRailPlanStore.getState().selectRequest("EM-001"));
    expect(screen.queryByRole("heading", { name: "Emergency track fault inspection" })).not.toBeInTheDocument();
    expect(screen.getByText(/select a request to see where it sits/i)).toBeInTheDocument();
  });

  it("removes emergency details when the active scenario changes and preserves baseline controls", () => {
    useRailPlanStore.getState().triggerDisruption("track-fault");
    useRailPlanStore.getState().selectRequest("EM-001");
    render(<RequestInspector />);
    expectEmergencyDetails();

    act(() => {
      useRailPlanStore.getState().triggerDisruption("team-unavailable");
      useRailPlanStore.getState().selectRequest("EM-001");
    });
    expect(screen.queryByText("EM-001")).not.toBeInTheDocument();
    act(() => useRailPlanStore.getState().selectRequest("M-001"));
    expect(screen.getByRole("heading", { name: requestById["M-001"].title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pin this time" })).toBeInTheDocument();
    expect(screen.getByText("Alternative slots")).toBeInTheDocument();
  });
});
