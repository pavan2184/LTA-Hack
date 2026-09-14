import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { SandboxSessionBoundary } from "@/components/layout/SandboxSessionBoundary";
import { PlannerAssistant } from "@/components/assistant/PlannerAssistant";
import { ViolationPanel } from "@/components/insights/ViolationPanel";
import { RequestQueue } from "@/components/requests/RequestQueue";
import { WorkforceTimeline } from "@/components/schedule/WorkforceTimeline";
import { useRailPlanStore } from "@/store/useRailPlanStore";

const navigation = vi.hoisted(() => ({ pathname: "/sandbox" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

beforeEach(() => {
  navigation.pathname = "/sandbox";
  localStorage.clear();
  useRailPlanStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("offers all six sandbox subpages from the RailPlan header", () => {
  render(<DashboardShell />);

  const links = [
    ["Overview", "/sandbox"],
    ["Requests", "/sandbox/requests"],
    ["Conflicts", "/sandbox/conflicts"],
    ["Schedule", "/sandbox/schedule"],
    ["Resources", "/sandbox/resources"],
    ["Scenarios", "/sandbox/scenarios"],
  ] as const;

  for (const [name, href] of links) {
    expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  }
  expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

it("marks a nested sandbox page as current", () => {
  navigation.pathname = "/sandbox/resources";
  render(<DashboardShell />);

  expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
    "aria-current",
  );
});

it("shows a deep-linked page only after the sandbox has been loaded", async () => {
  navigation.pathname = "/sandbox/requests";
  const user = userEvent.setup();

  render(
    <DashboardShell>
      <h2>Focused requests page</h2>
    </DashboardShell>,
  );

  expect(
    screen.getByRole("button", { name: "Load the submitted requests" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Focused requests page" }),
  ).not.toBeInTheDocument();

  await user.click(
    screen.getByRole("button", { name: "Load the submitted requests" }),
  );

  expect(
    await screen.findByRole("heading", { name: "Focused requests page" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Requested plan/ }),
  ).toBeInTheDocument();
});

it("retains request and conflict filters across subpage remounts", async () => {
  await act(async () => useRailPlanStore.getState().load());
  const user = userEvent.setup();

  const queue = render(<RequestQueue />);
  await user.type(screen.getByLabelText("Search requests"), "M-007");
  await user.click(screen.getByRole("button", { name: "All" }));
  queue.unmount();

  const queueAgain = render(<RequestQueue />);
  expect(screen.getByLabelText("Search requests")).toHaveValue("M-007");
  expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  queueAgain.unmount();

  const conflicts = render(<ViolationPanel />);
  const sector = screen.getByRole("button", { name: /Sector overlap \d+/ });
  await user.click(sector);
  conflicts.unmount();

  render(<ViolationPanel />);
  expect(
    screen.getByRole("button", { name: /Sector overlap \d+/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

it("retains workforce filters across subpage remounts", async () => {
  await act(async () => useRailPlanStore.getState().load());
  const user = userEvent.setup();

  const first = render(<WorkforceTimeline />);
  const role = screen.getByLabelText("Workforce role") as HTMLSelectElement;
  const chosen = role.value === "technician" ? "supervisor" : "technician";
  await user.selectOptions(role, chosen);
  const interval = screen.getAllByRole("button", { name: /^Inspect / })[0];
  const intervalName = interval.getAttribute("aria-label")!;
  await user.click(interval);
  first.unmount();

  render(<WorkforceTimeline />);
  expect(screen.getByLabelText("Workforce role")).toHaveValue(chosen);
  expect(screen.getByRole("button", { name: intervalName })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("retains assistant turns across subpage remounts", async () => {
  await act(async () => useRailPlanStore.getState().load());
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        answer: "The engine checked this placement.",
        mode: "engine",
        notice: "No optional model configured.",
      }),
    ),
  );
  const user = userEvent.setup();

  const first = render(<PlannerAssistant />);
  await user.type(
    screen.getByRole("textbox", { name: "Ask about this plan" }),
    "Why did work move?{Enter}",
  );
  await waitFor(() =>
    expect(screen.getByText("The engine checked this placement.")).toBeInTheDocument(),
  );
  first.unmount();

  render(<PlannerAssistant />);
  expect(screen.getByText("Why did work move?")).toBeInTheDocument();
  expect(screen.getByText("The engine checked this placement.")).toBeInTheDocument();
});

it("clears transient state when a different planner enters the sandbox", async () => {
  const session = render(
    <SandboxSessionBoundary actorId="planner-one">
      <span>Sandbox session</span>
    </SandboxSessionBoundary>,
  );
  act(() => {
    useRailPlanStore.setState({
      requestQuery: "M-007",
      assistantTurns: [{ role: "user", content: "Why did work move?" }],
    });
  });

  session.rerender(
    <SandboxSessionBoundary actorId="planner-two">
      <span>Sandbox session</span>
    </SandboxSessionBoundary>,
  );

  await waitFor(() => {
    expect(useRailPlanStore.getState().requestQuery).toBe("");
    expect(useRailPlanStore.getState().assistantTurns).toEqual([]);
  });
});

it("ignores an assistant response that finishes after sandbox reset", async () => {
  await act(async () => useRailPlanStore.getState().load());
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const user = userEvent.setup();
  render(<PlannerAssistant />);
  await user.type(
    screen.getByRole("textbox", { name: "Ask about this plan" }),
    "Why did work move?{Enter}",
  );
  expect(useRailPlanStore.getState().assistantPending).toBe(true);

  act(() => useRailPlanStore.getState().reset());
  await act(async () => {
    finish(
      Response.json({
        answer: "This belongs to the old plan.",
        mode: "engine",
        notice: null,
      }),
    );
  });

  await waitFor(() => {
    expect(useRailPlanStore.getState().assistantPending).toBe(false);
    expect(useRailPlanStore.getState().assistantTurns).toEqual([]);
  });
});

it("clears transient subpage state on reset", () => {
  useRailPlanStore.setState({
    requestQuery: "M-007",
    assistantTurns: [
      { role: "user", content: "Why did work move?" },
    ],
  });

  useRailPlanStore.getState().reset();

  expect(useRailPlanStore.getState().requestQuery).toBe("");
  expect(useRailPlanStore.getState().assistantTurns).toEqual([]);
});

it("writes only strategy and exact locked placements to browser persistence", async () => {
  await act(async () => useRailPlanStore.getState().load());
  const placement = useRailPlanStore.getState().activeResult()!.plan.placements[0];

  act(() => {
    useRailPlanStore.setState({
      strategy: "max-completion",
      locked: { [placement.requestId]: placement },
      requestQuery: "M-007",
      conflictFilter: "sector",
      workforceView: {
        filter: { teamId: "team-north", roleId: "technician" },
        selection: { basis: "visit-only", start: 60 },
      },
      assistantTurns: [{ role: "user", content: "Why did work move?" }],
    });
  });

  const saved = JSON.parse(
    localStorage.getItem("railplan-preferences") ?? "{}",
  ) as { state?: Record<string, unknown> };
  expect(Object.keys(saved.state ?? {}).sort()).toEqual(["locked", "strategy"]);
  expect(saved.state).toEqual({
    strategy: "max-completion",
    locked: { [placement.requestId]: placement },
  });
});
