import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { useRailPlanStore } from "@/store/useRailPlanStore";

function resetStore() {
  localStorage.clear();
  useRailPlanStore.setState({
    loaded: false,
    view: "submitted",
    strategy: "balanced",
    selectedRequestId: null,
    selectedViolationId: null,
    locked: {},
    overrides: {},
    lastRepair: [],
    baselineConflicts: 0,
    activeDisruptionId: null,
    hasReplanned: false,
    stage: "idle",
    submitted: null,
    planned: null,
    disruptionImpact: [],
  });
}

/** Load the requested plan and wait for the conflict list to render. */
async function loadRequests(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /load the submitted requests/i }));
  await waitFor(() => expect(screen.getByRole("heading", { name: /^Conflicts$/ })).toBeInTheDocument());
}

async function generateSchedule(user: ReturnType<typeof userEvent.setup>) {
  const button = screen.getByRole("button", { name: /generate optimal schedule/i });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  await waitFor(() => expect(useRailPlanStore.getState().planned).not.toBeNull(), { timeout: 5000 });
}

describe("planner workspace", () => {
  beforeEach(resetStore);

  it("opens on a statement of the problem, not a marketing page", async () => {
    render(<DashboardShell />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /22 maintenance requests\. One four-hour window\. 12 track blocks\./,
    );
    expect(screen.getByText(/must not be used for an operational decision/i)).toBeInTheDocument();
  });

  it("frames the page as requests, then conflicts, then a schedule", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);

    const steps = screen.getAllByRole("listitem");
    expect(steps[0]).toHaveTextContent(/Requested plan/);
    expect(steps[0]).toHaveTextContent(/22 requests received/);
    expect(steps[1]).toHaveTextContent(/Conflicts/);
    expect(steps[2]).toHaveTextContent(/Optimised schedule/);
    expect(steps[2]).toHaveTextContent(/not generated yet/);
  });

  it("derives conflicts from the requested times rather than declaring them", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);

    expect(screen.getByText(/Nobody typed this list/i)).toBeInTheDocument();

    const submitted = useRailPlanStore.getState().submitted;
    expect(submitted?.status).toBe("INFEASIBLE");
    expect(submitted!.violations.length).toBeGreaterThan(10);

    // The summary counts the same findings the engine produced, by category.
    const banner = screen.getByText(/conflicts detected across/i);
    expect(banner).toHaveTextContent(
      new RegExp(`${submitted!.violations.length} conflicts detected across`),
    );
    expect(screen.getByText(/sector overlaps/)).toBeInTheDocument();
  });

  it("names the minutes a conflict is broken in, not just the jobs", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);

    const worst = useRailPlanStore.getState().submitted!.violations[0];
    expect(worst.window).not.toBeNull();
    // Every timed rule reports the stretch at fault, so the chart can shade it.
    const timed = useRailPlanStore
      .getState()
      .submitted!.violations.filter((violation) => violation.shortfallMinutes > 0);
    expect(timed.every((violation) => violation.window !== null)).toBe(true);
    expect(timed.every((violation) => violation.window!.end > violation.window!.start)).toBe(true);
  });

  it("offers a resolution that was validated before it was offered", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);

    const worst = useRailPlanStore.getState().submitted!.violations[0];
    useRailPlanStore.getState().selectViolation(worst.id);

    await waitFor(() => expect(screen.getByText(/Recommended resolution/i)).toBeInTheDocument());

    const before = useRailPlanStore.getState().submitted!.violations.length;
    await user.click(screen.getByRole("button", { name: /apply suggestion/i }));

    await waitFor(() =>
      expect(useRailPlanStore.getState().submitted!.violations.length).toBeLessThan(before),
    );
    // The applied time is an edit to the requested plan, re-validated in place.
    expect(Object.keys(useRailPlanStore.getState().overrides)).toHaveLength(1);
  });

  it("works the whole conflict list down when asked, and says what is left", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);

    const before = useRailPlanStore.getState().submitted!.violations.length;
    await user.click(screen.getByRole("button", { name: /apply suggested fixes/i }));

    await waitFor(
      () => expect(useRailPlanStore.getState().stage).toBe("idle"),
      { timeout: 5000 },
    );

    const state = useRailPlanStore.getState();
    expect(state.lastRepair.length).toBeGreaterThan(0);
    expect(state.submitted!.violations.length).toBeLessThan(before);
    // Greedy repair, honestly reported: every move it made is one it validated.
    state.lastRepair.forEach((move) => {
      expect(state.overrides[move.requestId]).toBe(move.toMinute);
    });
  });

  it("solves, then reports its own verification and provenance", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);
    await generateSchedule(user);

    await waitFor(
      () => expect(screen.getByText(/Re-validated after solving: 0 violations/)).toBeInTheDocument(),
      { timeout: 5000 },
    );

    const planned = useRailPlanStore.getState().planned!;
    expect(planned.independentlyValidated).toBe(true);
    expect(screen.getByText(planned.inputHash)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(planned.solverVersion))).toBeInTheDocument();
  });

  it("shows the arithmetic behind a headline figure on request", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);

    await user.click(screen.getByRole("button", { name: /how weighted completion is calculated/i }));
    expect(screen.getByText(/weights critical 8 \/ high 4 \/ medium 2 \/ low 1/)).toBeInTheDocument();
  });

  it("labels the one estimated figure as an assumption", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);
    await generateSchedule(user);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /how planner time saved is calculated/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /how planner time saved is calculated/i }));
    expect(screen.getByText(/assumption, not a measurement/i)).toBeInTheDocument();
  });

  it("measures the schedule against the requests as submitted, not against its own fixes", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);

    const submitted = useRailPlanStore.getState().baselineConflicts;
    expect(submitted).toBeGreaterThan(10);

    await user.click(screen.getByRole("button", { name: /apply suggested fixes/i }));
    await waitFor(() => expect(useRailPlanStore.getState().stage).toBe("idle"), { timeout: 5000 });
    // Accepting suggestions must not move the bar the schedule is judged against.
    expect(useRailPlanStore.getState().baselineConflicts).toBe(submitted);

    await generateSchedule(user);
    expect(
      screen.getByText(new RegExp(`down from ${submitted} in the requests as submitted`)),
    ).toBeInTheDocument();
  });

  it("explains a placement with the rules that fire at the requested time", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);
    await generateSchedule(user);

    useRailPlanStore.getState().selectRequest("M-014");

    await waitFor(() => expect(screen.getByText(/Why this placement/)).toBeInTheDocument());
    expect(screen.getByText(/What happens at 01:00, tested against this plan/)).toBeInTheDocument();
  });

  it("re-solves when a placement is pinned, so figures cannot drift from the plan", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);
    await generateSchedule(user);

    const before = useRailPlanStore.getState().planned!.inputHash;
    const target = useRailPlanStore.getState().planned!.plan.placements[0].requestId;

    useRailPlanStore.getState().selectRequest(target);
    await waitFor(() => expect(screen.getByRole("button", { name: /pin this time/i })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /pin this time/i }));

    await waitFor(
      () => expect(useRailPlanStore.getState().planned!.inputHash).not.toBe(before),
      { timeout: 5000 },
    );

    const after = useRailPlanStore.getState().planned!;
    expect(after.plan.placements.find((p) => p.requestId === target)?.locked).toBe(true);
    expect(after.independentlyValidated).toBe(true);
  });

  it("keeps scenario testing secondary to the scheduling workflow", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);
    await generateSchedule(user);

    expect(screen.getByRole("heading", { name: /scenario testing/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /test a disruption/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /apply to this plan/i }));

    await waitFor(() => expect(screen.getByText(/Nothing has been rescheduled yet/)).toBeInTheDocument());
    expect(useRailPlanStore.getState().hasReplanned).toBe(false);

    await user.click(screen.getByRole("button", { name: /solve around it/i }));
    await waitFor(() => expect(useRailPlanStore.getState().hasReplanned).toBe(true), { timeout: 5000 });
    expect(useRailPlanStore.getState().planned!.independentlyValidated).toBe(true);
  });

  it("never presents a number without a way to check it", async () => {
    const user = userEvent.setup();
    render(<DashboardShell />);
    await loadRequests(user);

    const fx = screen.getAllByRole("button", { name: /how .* is calculated/i });
    // Every headline figure on screen exposes its formula.
    expect(fx.length).toBeGreaterThanOrEqual(11);
  });
});
