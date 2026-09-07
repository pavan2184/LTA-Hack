import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { buildWorld } from "@railplan/core/domain/world";
import type { Plan } from "@railplan/core/types/railplan";
import { WorkforceChart } from "@/components/schedule/WorkforceChart";

function fixture() {
  const instance = buildInstanceFromLiterals();
  instance.window = {
    ...instance.window,
    startMinute: 0,
    endMinute: 60,
    slotMinutes: 15,
  };
  instance.teams = [
    {
      ...instance.teams[0],
      id: "T-A",
      name: "Alpha",
      shiftStart: 0,
      shiftEnd: 60,
    },
    {
      ...instance.teams[1],
      id: "T-B",
      name: "Beta",
      shiftStart: 0,
      shiftEnd: 60,
    },
  ];
  instance.workforceRoles = [
    { id: "mechanic", name: "Mechanic" },
    { id: "electrician", name: "Electrician" },
  ];
  instance.workforceAvailability = [
    {
      planningNight: instance.planningNight,
      teamId: "T-A",
      roleId: "mechanic",
      startMinute: 0,
      endMinute: 60,
      count: 4,
    },
    {
      planningNight: instance.planningNight,
      teamId: "T-A",
      roleId: "electrician",
      startMinute: 0,
      endMinute: 60,
      count: 2,
    },
    {
      planningNight: instance.planningNight,
      teamId: "T-B",
      roleId: "mechanic",
      startMinute: 0,
      endMinute: 60,
      count: 8,
    },
  ];
  instance.workforceDemand = [
    { requestId: "M-001", roleId: "mechanic", count: 3 },
    { requestId: "M-002", roleId: "mechanic", count: 4 },
  ];
  const plan: Plan = {
    placements: [
      {
        requestId: "M-001",
        teamId: "T-A",
        startMinute: 0,
        endMinute: 30,
        locked: false,
      },
      {
        requestId: "M-002",
        teamId: "T-A",
        startMinute: 15,
        endMinute: 45,
        locked: false,
      },
    ],
    deferred: [],
  };
  return { plan, context: { world: buildWorld(instance) } };
}
async function values() {
  const user = userEvent.setup();
  await user.click(
    screen.getByText("Interval values and contributing requests"),
  );
  return screen.getByRole("table", { name: "Workforce interval values" });
}
describe("workforce chart", () => {
  it("shows exact demand, supply, signed remaining and textual shortages without aggregating pairs", async () => {
    render(<WorkforceChart {...fixture()} onSelectRequest={vi.fn()} />);
    expect(screen.getByLabelText("Workforce team")).toHaveValue("T-A");
    expect(screen.getByLabelText("Workforce role")).toHaveValue("mechanic");
    const table = await values();
    const row = within(table).getByRole("row", { name: /00:15.*00:30/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual([
      "4",
      "7",
      "−3",
      "Shortage: 3",
      expect.stringContaining("M-001"),
    ]);
    expect(
      screen.getByRole("button", { name: /Inspect 00:15.*00:30.*shortage 3/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Remaining = available − demanded/),
    ).toBeInTheDocument();
  });
  it("filters team and role independently and labels absent demand as zero only when definitions are complete", async () => {
    render(<WorkforceChart {...fixture()} onSelectRequest={vi.fn()} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Workforce team"), "T-B");
    const table = await values();
    let row = within(table).getByRole("row", { name: /00:00.*00:15/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .slice(0, 4)
        .map((cell) => cell.textContent),
    ).toEqual(["8", "0", "+8", "No shortage"]);
    await user.selectOptions(
      screen.getByLabelText("Workforce role"),
      "electrician",
    );
    row = within(table).getByRole("row", { name: /00:00.*00:15/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .slice(0, 3)
        .map((cell) => cell.textContent),
    ).toEqual(["0", "0", "0"]);
  });
  it("supports keyboard selection of a contributing request and marks current selection", async () => {
    const select = vi.fn();
    render(
      <WorkforceChart
        {...fixture()}
        selectedRequestId="M-001"
        onSelectRequest={select}
      />,
    );
    const user = userEvent.setup();
    const interval = screen.getByRole("button", {
      name: /Inspect 00:15.*00:30/,
    });
    interval.focus();
    await user.keyboard("{Enter}");
    const detail = screen.getByRole("region", {
      name: "Selected workforce interval",
    });
    const contributor = within(detail).getByRole("button", { name: /M-001/ });
    expect(contributor).toHaveAttribute("aria-pressed", "true");
    contributor.focus();
    await user.keyboard("{Enter}");
    expect(select).toHaveBeenCalledWith("M-001");
  });
  it("clears obsolete interval details when a new plan changes its contributors", () => {
    const input = fixture();
    const { rerender } = render(
      <WorkforceChart {...input} onSelectRequest={vi.fn()} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Inspect 00:15.*00:30/ }),
    );
    expect(
      screen.getByRole("region", { name: "Selected workforce interval" }),
    ).toBeInTheDocument();
    rerender(
      <WorkforceChart
        {...input}
        plan={{ ...input.plan, placements: [input.plan.placements[0]] }}
        onSelectRequest={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "Selected workforce interval" }),
    ).not.toBeInTheDocument();
  });
  it("warns about unknown demand without presenting zero shortages as a complete result", async () => {
    const input = fixture();
    input.plan.placements = [
      { ...input.plan.placements[0], requestId: "UNKNOWN" },
    ];
    render(<WorkforceChart {...input} onSelectRequest={vi.fn()} />);
    expect(screen.getByText(/Demand is unknown for/)).toHaveTextContent(
      "UNKNOWN",
    );
    expect(screen.queryByText(/No shortages for/)).not.toBeInTheDocument();
    const table = await values();
    expect(
      within(table).getByRole("columnheader", { name: "Known demand" }),
    ).toBeInTheDocument();
    expect(within(table).getAllByText("Unknown total")).toHaveLength(4);
  });
  it("has explicit loading, empty, stale and infeasible states", () => {
    const input = fixture();
    const { rerender } = render(
      <WorkforceChart {...input} loading onSelectRequest={vi.fn()} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading workforce");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    rerender(
      <WorkforceChart {...input} plan={null} onSelectRequest={vi.fn()} />,
    );
    expect(screen.getByText(/No plan is available/)).toBeInTheDocument();
    rerender(
      <WorkforceChart {...input} stale infeasible onSelectRequest={vi.fn()} />,
    );
    expect(screen.getByText(/Impact preview/)).toBeInTheDocument();
    expect(screen.getByText(/Plan is infeasible/)).toBeInTheDocument();
  });
});

it("keeps shortages beyond the engineering window visible", async () => {
  const input = fixture();
  render(
    <WorkforceChart
      {...input}
      context={{
        ...input.context,
        overrun: { requestId: "M-002", minutes: 30 },
      }}
      onSelectRequest={vi.fn()}
    />,
  );
  const table = await values();
  const row = within(table).getByRole("row", { name: /01:00.*01:15/ });
  expect(
    within(row)
      .getAllByRole("cell")
      .slice(0, 4)
      .map((cell) => cell.textContent),
  ).toEqual(["0", "4", "−4", "Shortage: 4"]);
});

it("exposes intervals for unlisted team or role references outside the filters", async () => {
  const input = fixture();
  input.plan.placements = [
    { ...input.plan.placements[0], teamId: "MISSING-TEAM" },
  ];
  render(<WorkforceChart {...input} onSelectRequest={vi.fn()} />);
  expect(
    screen.getByText(/Some workforce intervals use unknown teams or roles/),
  ).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByText(/Unlisted team\/role intervals/));
  const region = screen.getByRole("region", {
    name: "Unlisted workforce intervals",
  });
  expect(region).toHaveTextContent("MISSING-TEAM");
  expect(region).toHaveTextContent("shortage 3");
  expect(
    within(region).getByRole("button", { name: /M-001/ }),
  ).toBeInTheDocument();
});

it("preserves the chosen pair through loading while hiding stale interactive chart content", async () => {
  const input = fixture();
  const { rerender } = render(
    <WorkforceChart {...input} onSelectRequest={vi.fn()} />,
  );
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Workforce team"), "T-B");
  await user.selectOptions(
    screen.getByLabelText("Workforce role"),
    "electrician",
  );
  rerender(<WorkforceChart {...input} loading onSelectRequest={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading workforce");
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  rerender(
    <WorkforceChart
      {...input}
      plan={{ ...input.plan, placements: [input.plan.placements[0]] }}
      onSelectRequest={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("Workforce team")).toHaveValue("T-B");
  expect(screen.getByLabelText("Workforce role")).toHaveValue("electrician");
});
