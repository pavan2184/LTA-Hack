import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import type { Plan } from "@railplan/core/types/railplan";
import { PlannerQueue } from "@/components/plans/PlannerQueue";
import { PlannerTimeline } from "@/components/plans/PlannerTimeline";

function fixture() {
  const facts = buildInstanceFromLiterals();
  facts.requests = [
    { ...facts.requests[0], id: "TEST-A", title: "Rail inspection", shortTitle: "Inspect", blockIds: ["NS10-NS11"], sector: "North inspection sector", preferredStart: 0, clearanceMinutes: 15 },
    { ...facts.requests[1], id: "TEST-B", title: "Cable repair", shortTitle: "Cable", blockIds: ["NS10-NS11"], preferredStart: 30, clearanceMinutes: 5 },
    { ...facts.requests[2], id: "TEST-C", title: "Deferred equipment", shortTitle: "Equipment", blockIds: ["EW18-EW19"], clearanceMinutes: 10 },
  ];
  const plan: Plan = { placements: [
    { requestId: "TEST-A", startMinute: 0, endMinute: 30, teamId: "test", locked: false },
    { requestId: "TEST-B", startMinute: 35, endMinute: 50, teamId: "test", locked: false },
  ], deferred: [{ requestId: "TEST-C", bindingRuleIds: [], reason: "No available slot" }] };
  return { facts, plan, selectedRequestId: null, onSelectRequest: vi.fn() };
}

describe("Planner queue and timeline", () => {
  it("shows actual counts and searches request IDs, titles, sectors and atomic blocks", async () => {
    const user = userEvent.setup();
    render(<PlannerQueue {...fixture()} />);
    expect(screen.getByRole("button", { name: "All 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deferred 1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Changed 1" }));
    expect(screen.getByRole("button", { name: /TEST-B/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /TEST-A/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All 3" }));
    const search = screen.getByRole("searchbox", { name: "Search requests" });
    for (const term of ["test-a", "rail inspection", "north inspection sector", "NS10-NS11"]) {
      await user.clear(search);
      await user.type(search, term);
      expect(screen.getByRole("button", { name: /TEST-A/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /TEST-C/ })).not.toBeInTheDocument();
    }
    await user.clear(search);
    await user.click(screen.getByRole("button", { name: "Deferred 1" }));
    expect(screen.getByRole("button", { name: /TEST-C.*Deferred/ })).toBeInTheDocument();
  });

  it("renders all blocks, excludes deferrals, and packs clearance occupations into separate lanes", () => {
    const props = fixture();
    const { container } = render(<PlannerTimeline {...props} />);
    expect(container.querySelectorAll(".rp-block-row")).toHaveLength(props.facts.blocks.length);
    expect(screen.queryByRole("button", { name: /TEST-C/ })).not.toBeInTheDocument();
    const first = screen.getByRole("button", { name: /Select TEST-A/ });
    const second = screen.getByRole("button", { name: /Select TEST-B/ });
    expect(first).toHaveAttribute("data-lane", "0");
    expect(second).toHaveAttribute("data-lane", "1");
    expect(first).toHaveAccessibleName(/00:00–00:30, clearance 15 min until 00:45/);
    expect(first.querySelector(".rp-clearance-bar")).toHaveAttribute("data-clearance-end", "45");
    expect(first).toHaveStyle({ width: "18.75%" });
    expect(screen.getByText("Handback")).toBeInTheDocument();
  });

  it("reuses a lane at the exact clearance endpoint", () => {
    const props = fixture();
    props.plan.placements[1].startMinute = 45;
    render(<PlannerTimeline {...props} />);
    expect(screen.getByRole("button", { name: /Select TEST-B/ })).toHaveAttribute("data-lane", "0");
  });

  it("shares selection in both directions and keeps deferred requests selectable", async () => {
    const user = userEvent.setup();
    const props = fixture();
    function Harness() {
      const [selectedRequestId, onSelectRequest] = useState<string | null>(null);
      return <><PlannerQueue {...props} selectedRequestId={selectedRequestId} onSelectRequest={onSelectRequest} /><PlannerTimeline {...props} selectedRequestId={selectedRequestId} onSelectRequest={onSelectRequest} /></>;
    }
    render(<Harness />);
    const queue = within(screen.getByRole("region", { name: "Saved request queue" }));
    await user.click(queue.getByRole("button", { name: /TEST-A/ }));
    expect(screen.getByRole("button", { name: /Select TEST-A/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Select TEST-B/ }));
    expect(queue.getByRole("button", { name: /TEST-B/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(queue.getByRole("button", { name: /TEST-C/ }));
    expect(queue.getByRole("button", { name: /TEST-C/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Select TEST-B/ })).toHaveAttribute("aria-pressed", "false");
  });
});
