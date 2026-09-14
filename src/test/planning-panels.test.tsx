import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanningPanels } from "@/components/layout/PlanningPanels";
import {
  decodeLayout,
  defaultLayout,
} from "@/components/layout/layout-preferences";

function Fixture({
  preferenceKey = "layout-test",
}: {
  preferenceKey?: string;
}) {
  return (
    <PlanningPanels
      preferenceKey={preferenceKey}
      queue={
        <label>
          Queue search
          <input aria-label="Queue search" />
        </label>
      }
      primary={<h2>Primary Gantt</h2>}
      inspector={<button>Inspect request</button>}
      workforce={
        <label>
          Role filter
          <select defaultValue="technician">
            <option>technician</option>
            <option>supervisor</option>
          </select>
        </label>
      }
      geography={<button>Map request</button>}
    />
  );
}
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe("adjustable planning panels", () => {
  it("focuses the request layout on the queue and inspector", () => {
    const { container } = render(
      <PlanningPanels
        preferenceKey="focused-request-layout"
        variant="requests"
        queue={<p>Focused queue</p>}
        primary={<p>Hidden timeline</p>}
        inspector={<p>Focused inspector</p>}
        workforce={<p>Hidden workforce</p>}
        geography={<p>Hidden geography</p>}
      />,
    );

    expect(screen.getByText("Focused queue")).toBeInTheDocument();
    expect(screen.getByText("Focused inspector")).toBeInTheDocument();
    expect(screen.queryByText("Hidden timeline")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden workforce")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden geography")).not.toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Queue width" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Inspector width" })).toBeInTheDocument();

    const grid = container.querySelector<HTMLElement>("[data-planning-grid]")!;
    fireEvent.input(screen.getByRole("slider", { name: "Inspector width" }), {
      target: { value: "480" },
    });
    expect(grid.style.getPropertyValue("--inspector-width")).toBe("480px");
    expect(grid).toHaveClass(
      "lg:grid-cols-[var(--queue-width)_var(--inspector-width)]",
    );
  });

  it("focuses the resource layout on adjustable workforce and geography panels", () => {
    render(
      <PlanningPanels
        preferenceKey="focused-resource-layout"
        variant="resources"
        queue={<p>Hidden queue</p>}
        primary={<p>Hidden timeline</p>}
        inspector={<p>Hidden inspector</p>}
        workforce={<p>Focused workforce</p>}
        geography={<p>Focused geography</p>}
      />,
    );

    expect(screen.getByText("Focused workforce")).toBeInTheDocument();
    expect(screen.getByText("Focused geography")).toBeInTheDocument();
    expect(screen.queryByText("Hidden queue")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden timeline")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden inspector")).not.toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Workforce height" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Geography height" })).toBeInTheDocument();
  });

  it("keeps the Gantt before secondary panels and preserves mounted inputs through collapse", async () => {
    const { container } = render(<Fixture />);
    const user = userEvent.setup();
    await user.selectOptions(
      screen.getByLabelText("Role filter"),
      "supervisor",
    );
    await user.click(
      screen.getByRole("button", { name: "Collapse workforce panel" }),
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Expand workforce panel" }),
    );
    expect(screen.getByLabelText("Role filter")).toHaveValue("supervisor");
    const primary = screen.getByRole("heading", { name: "Primary Gantt" });
    const workforce = screen.getByRole("region", { name: "Workforce panel" });
    const geography = screen.getByRole("region", { name: "Geography panel" });
    expect(
      primary.compareDocumentPosition(workforce) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      workforce.compareDocumentPosition(geography) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector("[data-planning-grid]")).toBeInTheDocument();
  });
  it("resizes by keyboard and pointer input within bounds and announces the result", async () => {
    render(<Fixture />);
    const user = userEvent.setup();
    const queue = screen.getByRole("slider", { name: "Queue width" });
    queue.focus();
    await user.keyboard("{ArrowRight}");
    expect(queue).toHaveValue("264");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Queue width 264 pixels",
    );
    await user.keyboard("{End}");
    expect(queue).toHaveValue("360");
    const height = screen.getByRole("slider", { name: "Workforce height" });
    fireEvent.input(height, { target: { value: "480" } });
    expect(height).toHaveValue("480");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Workforce height 480 pixels",
    );
  });
  it("restores versioned preferences and keeps different workspaces isolated", async () => {
    const user = userEvent.setup();
    const first = render(<Fixture />);
    await user.click(
      screen.getByRole("button", { name: "Collapse queue panel" }),
    );
    fireEvent.input(screen.getByRole("slider", { name: "Geography height" }), {
      target: { value: "640" },
    });
    first.unmount();
    const second = render(<Fixture />);
    expect(
      await screen.findByRole("button", { name: "Expand queue panel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "Geography height" }),
    ).toHaveValue("640");
    second.unmount();
    render(<Fixture preferenceKey="other-layout" />);
    expect(
      screen.getByRole("button", { name: "Collapse queue panel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "Geography height" }),
    ).toHaveValue("520");
  });
  it("keeps resizing usable when browser storage rejects writes", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    render(<Fixture />);
    fireEvent.input(screen.getByRole("slider", { name: "Inspector width" }), {
      target: { value: "400" },
    });
    expect(screen.getByRole("slider", { name: "Inspector width" })).toHaveValue(
      "400",
    );
    expect(
      screen.getByText(/Layout preferences cannot be saved/),
    ).toBeInTheDocument();
  });
  it("restores defaults without resetting child workflow state", async () => {
    render(<Fixture />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Queue search"), "Pinned work");
    fireEvent.input(screen.getByRole("slider", { name: "Inspector width" }), {
      target: { value: "400" },
    });
    await user.click(
      screen.getByRole("button", { name: "Reset panel layout" }),
    );
    expect(screen.getByRole("slider", { name: "Inspector width" })).toHaveValue(
      "368",
    );
    expect(screen.getByLabelText("Queue search")).toHaveValue("Pinned work");
  });
});

describe("defensive layout decoding", () => {
  it("rejects malformed, obsolete and incomplete storage payloads", () => {
    for (const raw of [
      null,
      "{broken",
      "null",
      '{"version":2}',
      '{"version":1,"panels":{}}',
    ])
      expect(decodeLayout(raw)).toEqual(defaultLayout());
  });
  it("bounds valid numeric values and ignores unrecognized data", () => {
    const layout = defaultLayout();
    layout.panels.queue.size = 99999;
    layout.panels.geography.size = -1;
    expect(
      decodeLayout(JSON.stringify({ ...layout, unexpected: "ignored" })).panels
        .queue.size,
    ).toBe(360);
    expect(decodeLayout(JSON.stringify(layout)).panels.geography.size).toBe(
      280,
    );
    expect(
      decodeLayout(
        JSON.stringify({
          ...layout,
          panels: {
            ...layout.panels,
            queue: { size: "500", collapsed: "false" },
          },
        }),
      ),
    ).toEqual(defaultLayout());
  });
});

it("integrates the real dashboard with Gantt first and retained workforce selection", async () => {
  const { DashboardShell } = await import("@/components/layout/DashboardShell");
  const { SandboxLegacyDashboard } = await import(
    "@/test/fixtures/SandboxLegacyDashboard"
  );
  const { useRailPlanStore } = await import("@/store/useRailPlanStore");
  useRailPlanStore.getState().reset();
  render(
    <DashboardShell>
      <SandboxLegacyDashboard />
    </DashboardShell>,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Load the submitted requests" }),
  );
  const gantt = await screen.findByRole("heading", {
    name: "Block occupation",
  });
  const workforce = screen.getByRole("region", {
    name: "Workforce availability and demand",
  });
  expect(
    gantt.compareDocumentPosition(workforce) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  const role = screen.getByLabelText("Workforce role");
  await user.selectOptions(role, "supervisor");
  await user.click(
    screen.getByRole("button", { name: "Collapse workforce panel" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Expand workforce panel" }),
  );
  expect(screen.getByLabelText("Workforce role")).toHaveValue("supervisor");
});
