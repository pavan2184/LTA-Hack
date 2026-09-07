import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { GeographicNetworkView } from "@/components/network/GeographicNetworkView";
import { BlockTimeline } from "@/components/schedule/BlockTimeline";
import { RequestInspector } from "@/components/insights/RequestInspector";
import { useRailPlanStore } from "@/store/useRailPlanStore";

describe("geographic workspace selection", () => {
  beforeEach(async () => {
    useRailPlanStore.getState().reset();
    await useRailPlanStore.getState().load();
  });

  it("uses identical request and block IDs in both directions between map, timeline and inspector", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <GeographicNetworkView />
        <BlockTimeline />
        <RequestInspector />
      </>,
    );
    const work = screen.getByRole("region", {
      name: "Work shown on geographic map",
    });
    await user.click(within(work).getByText(/Active plan work list/));
    const link = within(work).getByRole("button", {
      name: "Select M-001 on geographic map",
    });
    link.focus();
    await user.keyboard("{Enter}");
    expect(useRailPlanStore.getState().selectedRequestId).toBe("M-001");
    expect(
      screen.getByRole("heading", { name: "Ultrasonic rail inspection" }),
    ).toBeInTheDocument();
    const selectedBlocks = () =>
      Array.from(
        container.querySelectorAll('[data-block-id][data-selected="true"]'),
      )
        .map((node) => node.getAttribute("data-block-id"))
        .sort();
    expect(selectedBlocks()).toEqual(["NS10-NS11", "NS11-NS12"]);
    expect(
      screen
        .getAllByRole("button", {
          name: "Select M-001, Ultrasonic rail inspection",
        })
        .every((button) => button.getAttribute("aria-pressed") === "true"),
    ).toBe(true);
    await user.click(
      screen.getAllByRole("button", {
        name: "Select M-007, Platform screen door test",
      })[0],
    );
    expect(selectedBlocks()).toEqual(["CC10-CC11", "CC11-CC12"]);
    expect(
      screen.getByRole("heading", { name: "Platform screen door test" }),
    ).toBeInTheDocument();
  });

  it("highlights the emergency's exact affected blocks and removes them when cleared", async () => {
    const { container } = render(
      <>
        <GeographicNetworkView />
        <RequestInspector />
      </>,
    );
    act(() => useRailPlanStore.getState().triggerDisruption("track-fault"));
    const affected = () =>
      Array.from(
        container.querySelectorAll('[data-block-id][data-affected="true"]'),
      )
        .map((node) => node.getAttribute("data-block-id"))
        .sort();
    expect(affected()).toEqual(["NS12-NS13", "NS13-NS14"]);
    expect(screen.getByText(/Selected work: EM-001/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Emergency track fault inspection" }),
    ).toBeInTheDocument();
    await act(async () => useRailPlanStore.getState().replan());
    expect(affected()).toEqual(["NS12-NS13", "NS13-NS14"]);
    await act(async () => useRailPlanStore.getState().clearDisruption());
    expect(affected()).toEqual([]);
    expect(
      screen.queryByRole("heading", {
        name: "Emergency track fault inspection",
      }),
    ).not.toBeInTheDocument();
  });
});
