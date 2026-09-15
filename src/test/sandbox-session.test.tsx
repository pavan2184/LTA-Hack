import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SandboxSessionBoundary } from "@/components/layout/SandboxSessionBoundary";
import { useRailPlanStore } from "@/store/useRailPlanStore";

afterEach(() => { cleanup(); useRailPlanStore.getState().reset(); });

function Selected() {
  const id = useRailPlanStore(state => state.selectedRequestId);
  return <p>{id ?? "No selection"}</p>;
}

it("clears inherited state on first entry and planner switches, retaining same-planner state", () => {
  useRailPlanStore.setState({ sandboxActorId: null, selectedRequestId: "old selection" });
  const view = render(<SandboxSessionBoundary actorId="planner-a"><Selected /></SandboxSessionBoundary>);
  expect(screen.queryByText("old selection")).not.toBeInTheDocument();
  act(() => useRailPlanStore.getState().selectRequest("M-008"));
  view.rerender(<SandboxSessionBoundary actorId="planner-a"><Selected /></SandboxSessionBoundary>);
  expect(screen.getByText("M-008")).toBeInTheDocument();
  view.rerender(<SandboxSessionBoundary actorId="planner-b"><Selected /></SandboxSessionBoundary>);
  expect(screen.getByText("No selection")).toBeInTheDocument();
  expect(useRailPlanStore.getState().locked).toEqual({});
});

it.each(["load", "buildPlan", "applyAllSuggestions"] as const)("discards an old planner's pending %s result", async (operation) => {
  useRailPlanStore.getState().beginSandboxSession("planner-a");
  await useRailPlanStore.getState().load();
  const pending = useRailPlanStore.getState()[operation]();
  useRailPlanStore.getState().beginSandboxSession("planner-b");
  await pending;
  expect(useRailPlanStore.getState()).toMatchObject({ sandboxActorId: "planner-b", loaded: false, submitted: null, planned: null, stage: "idle", overrides: {} });
});
