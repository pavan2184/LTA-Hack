import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import type { Ps1Instance, Submission } from "@railplan/ps1/types/ps1";
import { WorkSchedule } from "@/components/ps1/WorkSchedule";

const original = loadInstance(Object.fromEntries(PS1_FILES.map((file) => [file, readFileSync(resolve("packages/ps1/data/public", file), "utf8")])));
const instance: Ps1Instance = {
  ...original,
  contracts: original.contracts.slice(0, 2).map((contract) => ({ ...contract, plannedCompletionDate: "2027-02-07" })),
  activities: original.activities.slice(0, 3).map((activity, index) => ({
    ...activity,
    activityId: `WORK-${index + 1}`,
    contractNumber: index < 2 ? original.contracts[0].contractNumber : original.contracts[1].contractNumber,
    totalAccesses: index === 0 ? 2 : 1,
    plannedStartDate: "2027-01-11",
    predecessorActivityId: index === 1 ? "WORK-1" : null,
  })),
};
const submission: Submission = {
  scenario: "C",
  access: [
    { activityId: "WORK-1", accessSeq: 1, week: 2, accessNight: 1, eclo: 0 },
    { activityId: "WORK-1", accessSeq: 2, week: 6, accessNight: 1, eclo: 1 },
    { activityId: "WORK-2", accessSeq: 1, week: 7, accessNight: 2, eclo: 0 },
    { activityId: "WORK-3", accessSeq: 1, week: 3, accessNight: 1, eclo: 0 },
  ],
  occupancy: [{ activityId: "WORK-3", locationId: instance.activities[2].startLocationId, week: 3, coShareGroup: "group-1" }],
  results: [
    { scenario: "C", contractNumber: instance.contracts[0].contractNumber, simulatedCompletionDate: "2027-02-21", overrunDays: 14 },
    { scenario: "C", contractNumber: instance.contracts[1].contractNumber, simulatedCompletionDate: "2027-01-24", overrunDays: 0 },
  ],
};

function setup() {
  const onSelect = vi.fn();
  return { ...render(<WorkSchedule instance={instance} submission={submission} selection={null} onSelect={onSelect} pins={[{ activityId: "WORK-1", week: 2 }]} />), onSelect, user: userEvent.setup() };
}

describe("PS1 hierarchical work schedule", () => {
  it("shows discrete accesses across gaps, weighted yield, and explicitly labelled contract summaries", () => {
    setup();
    const table = screen.getByRole("table", { name: "Contracts and weekly scheduled access" });
    expect(within(table).getByRole("columnheader", { name: "Week 1, 4 Jan" })).toBeInTheDocument();
    expect(within(table).getAllByRole("button", { name: /^WORK-1, week/ })).toHaveLength(2);
    expect(within(table).queryByRole("button", { name: /^WORK-1, week 3:/ })).not.toBeInTheDocument();
    expect(within(table).getByRole("button", { name: /WORK-1, week 6: 1.5 access-nights of work, ECLO/ })).toBeInTheDocument();
    expect(within(table).getByText("2.5/2")).toBeInTheDocument();
    expect(within(table).getByText("Summary · W2–7 · +14d")).toBeInTheDocument();
    expect(within(table).getByText("+7d")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Planned completion 2027-02-07" }).length).toBeGreaterThan(0);
  });

  it("collapses groups without losing them and restores the full hierarchy", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /^Collapse C001:/ }));
    expect(screen.queryByRole("button", { name: /^Inspect WORK-1:/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Inspect WORK-3:/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand all contracts" }));
    expect(screen.getAllByRole("button", { name: /^Inspect WORK-/ })).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Collapse all contracts" }));
    expect(screen.queryByRole("button", { name: /^Inspect WORK-/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Expand C00/ })).toHaveLength(2);
  });

  it("filters by identity and pinned work with an empty-state recovery", async () => {
    const { user } = setup();
    await user.type(screen.getByRole("searchbox", { name: "Find contract or activity" }), "WORK-3");
    expect(screen.getAllByRole("button", { name: /^Inspect WORK-/ })).toHaveLength(1);
    await user.selectOptions(screen.getByRole("combobox", { name: "Activity filter" }), "pinned");
    expect(screen.getByText("No matching activities")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Activity filter" }), "pinned");
    expect(screen.getByRole("button", { name: /^Inspect WORK-1:/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Inspect WORK-3:/ })).not.toBeInTheDocument();
  });

  it("keeps work in one roving tab stop and navigates rows and sparse accesses with arrows", async () => {
    const { user, onSelect } = setup();
    const labels = screen.getAllByRole("button", { name: /^Inspect WORK-/ });
    expect(labels.filter((label) => label.tabIndex === 0)).toHaveLength(1);
    const first = screen.getByRole("button", { name: /^Inspect WORK-1:/ });
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /^WORK-1, week 2:/ })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: /^WORK-1, week 6:/ })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith({ kind: "activity", activityId: "WORK-1" });
    await user.keyboard("{Escape}{ArrowDown}");
    expect(screen.getByRole("button", { name: /^Inspect WORK-2:/ })).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith({ kind: "activity", activityId: "WORK-2" });
  });

  it("links location selections to activity rows", () => {
    render(<WorkSchedule instance={instance} submission={submission} selection={{ kind: "location-week", locationId: instance.activities[2].startLocationId, week: 3 }} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^Inspect WORK-3:/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Inspect WORK-1:/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("retains full imported identifiers in accessible labels and selection when displayed labels truncate", async () => {
    const longId = "MAINTENANCE-ALPHA-EASTBOUND-SECTOR-RENEWAL-2027-ACTIVITY-000001";
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const longInstance = { ...instance, activities: instance.activities.map((activity, index) => index === 0 ? { ...activity, activityId: longId } : activity) };
    const longSubmission = { ...submission, access: submission.access.map((access) => access.activityId === "WORK-1" ? { ...access, activityId: longId } : access) };
    render(<WorkSchedule instance={longInstance} submission={longSubmission} selection={null} onSelect={onSelect} />);
    const label = screen.getByRole("button", { name: `Inspect ${longId}: Renewal` });
    expect(label).toHaveAttribute("title", expect.stringContaining(longId));
    await user.click(label);
    expect(onSelect).toHaveBeenCalledWith({ kind: "activity", activityId: longId });
    expect(screen.getByRole("button", { name: `${longId}, week 2: 1 access-night of work` })).toBeInTheDocument();
  });

  it("moves the real viewport from the overview and preserves week position when changing scale", async () => {
    const { user } = setup();
    const scroll = screen.getByLabelText("Weekly work schedule, horizontally scrollable");
    await user.click(screen.getByRole("button", { name: "Go to week 8, 0 scheduled accesses" }));
    expect(scroll.scrollLeft).toBe(7 * 46);
    const range = screen.getByRole("slider", { name: "First visible schedule week" });
    expect(range).toHaveAttribute("aria-valuetext", "Weeks 8 to 22");
    fireEvent.change(range, { target: { value: "3" } });
    expect(scroll.scrollLeft).toBe(2 * 46);
    await user.selectOptions(screen.getByRole("combobox", { name: "Schedule scale" }), "detail");
    expect(range).toHaveAttribute("aria-valuetext", "Weeks 3 to 12");
  });
});
