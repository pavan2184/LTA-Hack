import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { WorkforceTimeline } from "@/components/schedule/WorkforceTimeline";
import { BlockTimeline } from "@/components/schedule/BlockTimeline";
import { RequestInspector } from "@/components/insights/RequestInspector";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import { requestById } from "@railplan/core/data/requests";

describe("workforce chart integration", () => {
  beforeEach(async () => {
    useRailPlanStore.getState().reset();
    await useRailPlanStore.getState().load();
  });

  it("retains a selected nondefault team and role across visible solver loading", async () => {
    const user = userEvent.setup();
    render(<WorkforceTimeline />);
    await user.selectOptions(screen.getByLabelText("Workforce team"), "T-RRT");
    await user.selectOptions(
      screen.getByLabelText("Workforce role"),
      "supervisor",
    );
    let building: Promise<void>;
    act(() => {
      building = useRailPlanStore.getState().buildPlan();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Loading workforce");
    await act(async () => {
      await building;
    });
    expect(screen.getByLabelText("Workforce team")).toHaveValue("T-RRT");
    expect(screen.getByLabelText("Workforce role")).toHaveValue("supervisor");
  });

  it("updates available people at the withdrawal boundary and clears preview on replan", async () => {
    const user = userEvent.setup();
    render(<WorkforceTimeline />);
    await user.selectOptions(screen.getByLabelText("Workforce team"), "T-ALP");
    await user.selectOptions(
      screen.getByLabelText("Workforce role"),
      "technician",
    );
    await user.click(
      screen.getByText("Interval values and contributing requests"),
    );
    const supplyAt = (span: RegExp) =>
      within(
        within(
          screen.getByRole("table", { name: "Workforce interval values" }),
        ).getByRole("row", { name: span }),
      ).getAllByRole("cell")[0].textContent;
    expect(supplyAt(/01:30.*01:45/)).toBe("6");
    act(() =>
      useRailPlanStore.getState().triggerDisruption("team-unavailable"),
    );
    expect(supplyAt(/01:15.*01:30/)).toBe("6");
    expect(supplyAt(/01:30.*01:45/)).toBe("0");
    await act(async () => useRailPlanStore.getState().replan());
    expect(supplyAt(/01:30.*01:45/)).toBe("0");
    expect(useRailPlanStore.getState().hasReplanned).toBe(true);
  });

  it("selects the same request in workforce details, timeline and inspector with the keyboard", async () => {
    const user = userEvent.setup();
    const firstViolation = useRailPlanStore.getState().activeResult()!
      .violations[0];
    useRailPlanStore.getState().selectViolation(firstViolation.id);
    render(
      <>
        <WorkforceTimeline />
        <BlockTimeline />
        <RequestInspector />
      </>,
    );
    const interval = screen.getAllByRole("button", {
      name: /Inspect .*shortage [1-9]/i,
    })[0];
    interval.focus();
    await user.keyboard("{Enter}");
    const details = screen.getByRole("region", {
      name: "Selected workforce interval",
    });
    const requestButton = within(details).getAllByRole("button")[0];
    requestButton.focus();
    await user.keyboard("{Enter}");
    const id = useRailPlanStore.getState().selectedRequestId!;
    expect(id).toBeTruthy();
    expect(useRailPlanStore.getState().selectedViolationId).toBeNull();
    expect(
      screen.getByRole("heading", { name: requestById[id].title }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button", {
          name: `Select ${id}, ${requestById[id].title}`,
        })
        .every((button) => button.getAttribute("aria-pressed") === "true"),
    ).toBe(true);
  });
});
