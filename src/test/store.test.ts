import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { scheduleVariants } from "@/data/schedules";
import { useRailPlanStore } from "@/store/useRailPlanStore";

describe("RailPlan store", () => {
  beforeEach(() => {
    localStorage.clear();
    useRailPlanStore.setState({
      selectedStrategy: "balanced",
      lockedRequestIds: [],
      lockedPlacements: {},
    });
    useRailPlanStore.getState().resetDemo();
  });

  it("loads the original demo and selects a request", () => {
    act(() => useRailPlanStore.getState().loadDemo());
    act(() => useRailPlanStore.getState().selectRequest("M-014"));

    expect(useRailPlanStore.getState().isDemoLoaded).toBe(true);
    expect(useRailPlanStore.getState().currentView).toBe("original");
    expect(useRailPlanStore.getState().selectedRequestId).toBe("M-014");
  });

  it("changes strategy and locks planner-selected work", () => {
    act(() => useRailPlanStore.getState().changeStrategy("min-risk"));
    act(() => useRailPlanStore.getState().toggleLock("M-014"));

    expect(useRailPlanStore.getState().selectedStrategy).toBe("min-risk");
    expect(useRailPlanStore.getState().lockedRequestIds).toContain("M-014");
  });

  it("preserves a locked placement when the strategy changes", () => {
    useRailPlanStore.setState({ currentView: "optimised", isDemoLoaded: true });
    act(() => useRailPlanStore.getState().toggleLock("M-017"));
    const lockedStart = useRailPlanStore.getState().getVisibleSchedule().jobs.find((job) => job.requestId === "M-017")?.startTime;

    act(() => useRailPlanStore.getState().changeStrategy("min-changes"));

    expect(useRailPlanStore.getState().getVisibleSchedule().jobs.find((job) => job.requestId === "M-017")?.startTime).toBe(lockedStart);
  });

  it("runs optimisation and exposes the strategy metrics", async () => {
    vi.useFakeTimers();
    act(() => useRailPlanStore.getState().loadDemo());
    const promise = useRailPlanStore.getState().optimise();

    expect(useRailPlanStore.getState().isOptimising).toBe(true);
    await vi.advanceTimersByTimeAsync(1100);
    await promise;

    expect(useRailPlanStore.getState().currentView).toBe("optimised");
    expect(useRailPlanStore.getState().isOptimising).toBe(false);
    expect(useRailPlanStore.getState().getVisibleSchedule().metrics).toEqual(
      scheduleVariants.balanced.metrics,
    );
    vi.useRealTimers();
  });

  it("applies a disruption and then replans it", async () => {
    vi.useFakeTimers();
    act(() => useRailPlanStore.getState().triggerDisruption("track-fault"));
    expect(useRailPlanStore.getState().currentView).toBe("disrupted");
    expect(useRailPlanStore.getState().activeDisruptionId).toBe("track-fault");

    const promise = useRailPlanStore.getState().replan();
    await vi.advanceTimersByTimeAsync(900);
    await promise;

    expect(useRailPlanStore.getState().hasReplanned).toBe(true);
    expect(useRailPlanStore.getState().getVisibleSchedule().metrics.activeConflicts).toBe(0);
    vi.useRealTimers();
  });

  it("resets the demo while retaining planner preferences", () => {
    act(() => useRailPlanStore.getState().changeStrategy("emergency-buffer"));
    act(() => useRailPlanStore.getState().toggleLock("M-003"));
    act(() => useRailPlanStore.getState().loadDemo());
    act(() => useRailPlanStore.getState().resetDemo());

    expect(useRailPlanStore.getState().isDemoLoaded).toBe(false);
    expect(useRailPlanStore.getState().selectedStrategy).toBe("emergency-buffer");
    expect(useRailPlanStore.getState().lockedRequestIds).toContain("M-003");
  });
});
