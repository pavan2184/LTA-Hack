import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import type { PlanExport } from "@railplan/core/types/exports";
import { SavedPlanReview } from "@/components/plans/SavedPlanReview";

const ownedId = "R-11223344-1122-4122-8122-112233445566";
const firstId = "11223344-1122-4122-8122-112233445566";
const secondId = "22334455-2233-4233-8233-223344556677";

function fixture(id = firstId): PlanExport {
  const facts = structuredClone(buildInstanceFromLiterals());
  const original = facts.requests[0];
  facts.requests = [
    {
      ...original,
      id: ownedId,
      submissionRevision: 7,
      title: "Saved contractor rail inspection",
      shortTitle: "Saved owned work",
      blockIds: ["NS10-NS11", "NS11-NS12"],
      teamId: facts.teams[0].id,
      dependencies: [],
      mandatory: true,
    },
    {
      ...facts.requests[1],
      id: "R-deferred",
      title: "Saved deferred work",
      shortTitle: "Deferred",
      dependencies: [],
    },
  ];
  facts.workforceDemand = [
    { requestId: ownedId, roleId: facts.workforceRoles[0].id, count: 3 },
  ];
  const metrics = Object.fromEntries(
    [
      "placed",
      "weightedCompletion",
      "criticalPlaced",
      "violations",
      "conflictedRequests",
      "blockUtilisation",
      "teamUtilisation",
      "workforceUtilisation",
      "workforceShortageIntervals",
      "equipmentUtilisation",
      "bufferCompliance",
      "emergencyCapacity",
      "flexibility",
      "movement",
    ].map((key) => [
      key,
      {
        key,
        label: `Saved ${key}`,
        value: key === "placed" ? 71 : 0,
        unit: "count" as const,
        numerator: 71,
        denominator: 93,
        formula: "stored numerator / stored denominator",
        note: "Persisted fixture arithmetic",
      },
    ]),
  ) as unknown as PlanExport["metrics"];
  return {
    exportVersion: 1,
    notice: "Non-operational prototype. No safety approval.",
    assessment: {
      nonOperational: true,
      publicationState: "draft",
      sourceFreshness: "current",
      stale: false,
      engineVersionMatch: true,
      currentSourceRevision: "9",
      warnings: [],
      publishedAt: null,
      supersededBy: null,
    },
    provenance: {
      planId: id,
      planningNight: facts.planningNight,
      sourceRevision: "9",
      inputDigest: "saved-digest",
      solverVersion: "saved-solver",
      constraintVersion: "saved-constraints",
      strategy: "balanced",
      status: "FEASIBLE",
      independentlyValidated: true,
      generatedAt: "2026-09-07T01:02:03Z",
      createdBy: "planner",
      solveMs: 12,
      candidatesEvaluated: 84,
    },
    parameters: {
      planningNight: facts.planningNight,
      strategy: "balanced",
      locked: [],
    },
    placements: [
      {
        requestId: ownedId,
        startMinute: 35,
        endMinute: 95,
        teamId: facts.teams[0].id,
        locked: false,
        title: facts.requests[0].title,
        sector: facts.requests[0].sector,
        blockIds: facts.requests[0].blockIds,
        submissionRevision: 7,
      },
    ],
    deferrals: [
      {
        requestId: "R-deferred",
        reason: "Saved crew shortage",
        bindingRuleIds: ["WORKFORCE_CAPACITY"],
        title: facts.requests[1].title,
        sector: facts.requests[1].sector,
        blockIds: facts.requests[1].blockIds,
        submissionRevision: null,
      },
    ],
    metrics,
    objectives: [{ label: "Saved objective", value: 123, unit: "points" }],
    validation: { independentlyValidated: true, violations: [] },
    facts,
  };
}
function response(value: PlanExport) {
  return { ok: true, json: async () => value } as Response;
}
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("saved snapshot visual review", () => {
  it("lists work without a slot above the panels and opens it in the inspector", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(fixture())));
    render(<SavedPlanReview planId={firstId} />);
    const unplaced = await screen.findByRole("region", { name: "Work without a slot" });
    expect(unplaced).toHaveTextContent("1 of 2 requests");
    expect(unplaced).toHaveTextContent("R-deferred");
    expect(unplaced).toHaveTextContent("Saved crew shortage");
    await userEvent.click(within(unplaced).getByRole("button", { name: "Review R-deferred" }));
    expect(screen.getByRole("region", { name: "Saved request inspector" })).toHaveTextContent(
      "Saved crew shortage",
    );
  });

  it("keeps MRT identity on block labels and uses neutral placement bars with accent selection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(fixture())));
    render(<SavedPlanReview planId={firstId} />);
    const timeline = await screen.findByRole("region", {
      name: "Saved block Gantt",
    });
    const bar = within(timeline).getByRole("button", {
      name: `Select ${ownedId} on NS10-NS11, 00:35–01:35`,
    });
    expect(bar).toHaveClass("bg-surface", "text-ink-900", "border-rule-strong");
    expect(bar.style.backgroundColor).toBe("");
    for (const [block, tone] of [
      ["NS10-NS11", "text-line-ns-ink"],
      ["EW18-EW19", "text-line-ew-ink"],
      ["CC11-CC12", "text-line-cc-ink"],
    ]) {
      const label = within(timeline).getByText(block, { exact: true });
      expect(label).toHaveClass(tone);
      expect(label.style.color).toBe("");
    }
    await userEvent.click(bar);
    expect(bar).toHaveClass("border-accent", "ring-accent");
    expect(bar).toHaveAttribute("aria-pressed", "true");
    expect(bar).not.toHaveClass(
      "text-white",
      "bg-signal-red",
      "bg-signal-green",
    );
  });

  it("renders every atomic block and the owned request from saved facts, with exact times and persisted figures", async () => {
    const saved = fixture();
    const fetch = vi.fn().mockResolvedValue(response(saved));
    vi.stubGlobal("fetch", fetch);
    render(<SavedPlanReview planId={firstId} />);
    const timeline = await screen.findByRole("region", {
      name: "Saved block Gantt",
    });
    for (const block of saved.facts.blocks)
      expect(
        within(timeline).getAllByText(block.id, { exact: true })[0],
      ).toBeInTheDocument();
    expect(
      within(timeline).getAllByRole("button", {
        name: new RegExp(`Select ${ownedId} on`),
      }),
    ).toHaveLength(2);
    await userEvent.click(
      screen.getByText("Exact saved placements and deferrals"),
    );
    expect(
      screen.getByRole("table", { name: "Saved placements and deferrals" }),
    ).toHaveTextContent("00:35–01:35");
    expect(fetch).toHaveBeenCalledWith(
      `/api/plans/${firstId}/export?format=json`,
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Show how Saved placed is calculated",
      }),
    );
    expect(
      screen.getByText("stored numerator / stored denominator"),
    ).toBeInTheDocument();
    expect(screen.getByText("71 / 93")).toBeInTheDocument();
    expect(screen.getByText(/saved-digest/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /pin|solve|alternative/i }),
    ).not.toBeInTheDocument();
  });

  it("shares selection between the queue, Gantt, workforce contributors, map and read-only inspector", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(fixture())));
    render(<SavedPlanReview planId={firstId} />);
    const queue = await screen.findByRole("region", {
      name: "Saved request queue",
    });
    await userEvent.click(
      within(queue).getByRole("button", { name: new RegExp(ownedId) }),
    );
    const inspector = screen.getByRole("region", {
      name: "Saved request inspector",
    });
    expect(
      within(inspector).getByRole("heading", {
        name: "Saved contractor rail inspection",
      }),
    ).toBeInTheDocument();
    expect(inspector).toHaveTextContent("Revision 7");
    expect(inspector).toHaveTextContent("00:35–01:35");
    expect(inspector).toHaveTextContent("Mandatory");
    expect(
      screen.getByRole("button", {
        name: `Select ${ownedId} on geographic map`,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(
      within(queue).getByRole("button", { name: /R-deferred/ }),
    );
    expect(inspector).toHaveTextContent("Saved crew shortage");
    const workforce = screen.getByRole("region", {
      name: "Workforce availability and demand",
    });
    await userEvent.click(
      within(workforce).getByText("Interval values and contributing requests"),
    );
    await userEvent.click(
      within(workforce).getAllByRole("button", {
        name: new RegExp(ownedId),
      })[0],
    );
    expect(inspector).toHaveTextContent("Saved contractor rail inspection");
    await userEvent.click(
      within(queue).getByRole("button", { name: /R-deferred/ }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: `Select ${ownedId} on geographic map`,
      }),
    );
    expect(inspector).toHaveTextContent("Saved contractor rail inspection");
    await userEvent.click(
      within(queue).getByRole("button", { name: /R-deferred/ }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: `Select ${ownedId} on NS10-NS11, 00:35–01:35`,
      }),
    );
    expect(inspector).toHaveTextContent("Saved contractor rail inspection");
    expect(inspector).toHaveTextContent(
      `${fixture().facts.workforceRoles[0].name}: 3`,
    );
  });

  it("labels stale, infeasible and superseded saved results without an impact-preview or new validation claim", async () => {
    const saved = fixture();
    Object.assign(saved.assessment, {
      stale: true,
      sourceFreshness: "stale",
      publicationState: "superseded",
      engineVersionMatch: false,
    });
    saved.provenance.status = "INFEASIBLE";
    saved.validation.independentlyValidated = false;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(saved)));
    render(<SavedPlanReview planId={firstId} />);
    expect(
      await screen.findByText(/Source stale: saved revision 9/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Superseded version/)).toBeInTheDocument();
    expect(screen.getByText(/Infeasible saved result/)).toBeInTheDocument();
    expect(
      screen.getByText(/Saved independent validation: failed/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Impact preview:/)).not.toBeInTheDocument();
  });

  it("ignores a late response for the previous version and aborts obsolete requests", async () => {
    let resolveFirst!: (value: Response) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(response(fixture(secondId)));
    vi.stubGlobal("fetch", fetch);
    const view = render(<SavedPlanReview planId={firstId} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading saved version",
    );
    view.rerender(<SavedPlanReview planId={secondId} />);
    await screen.findByText(new RegExp(secondId));
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolveFirst(response(fixture(firstId))));
    expect(
      screen.queryByText(firstId, { exact: true }),
    ).not.toBeInTheDocument();
    view.unmount();
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
  });

  it("clears previous details during loading and handles failure without showing a literal plan", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(fixture()))
      .mockRejectedValueOnce(new Error("network"));
    vi.stubGlobal("fetch", fetch);
    const view = render(<SavedPlanReview planId={firstId} />);
    await screen.findByRole("region", { name: "Saved block Gantt" });
    view.rerender(<SavedPlanReview planId={secondId} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load this saved version",
    );
    expect(
      screen.queryByRole("region", { name: "Saved block Gantt" }),
    ).not.toBeInTheDocument();
  });

  it("shows HTTP authorization failures as a bounded error and rejects mismatched snapshots", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 403 })
        .mockResolvedValueOnce(response(fixture(firstId))),
    );
    const view = render(<SavedPlanReview planId={firstId} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load this saved version",
    );
    view.rerender(<SavedPlanReview planId={secondId} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load this saved version",
    );
    expect(
      screen.queryByRole("region", { name: "Saved block Gantt" }),
    ).not.toBeInTheDocument();
  });

  it("refreshes status explicitly after failure and after success while retaining saved times", async () => {
    const stale = fixture();
    Object.assign(stale.assessment, {
      sourceFreshness: "stale",
      stale: true,
      currentSourceRevision: "10",
    });
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response(fixture()))
      .mockResolvedValueOnce(response(stale));
    vi.stubGlobal("fetch", fetch);
    render(<SavedPlanReview planId={firstId} />);
    await screen.findByRole("alert");
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh saved review/status" }),
    );
    await screen.findByRole("region", { name: "Saved block Gantt" });
    await userEvent.click(
      screen.getByRole("button", { name: "Refresh saved review/status" }),
    );
    expect(
      await screen.findByText(
        /Source stale: saved revision 9; observed current revision 10/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Select ${ownedId} on NS10-NS11, 00:35–01:35`,
      }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps the Gantt and inspection available when saved stations have no geography", async () => {
    const saved = fixture();
    saved.facts.stations = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(saved)));
    render(<SavedPlanReview planId={firstId} />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: `Select ${ownedId} on NS10-NS11, 00:35–01:35`,
      }),
    );
    expect(
      screen.getByRole("region", { name: "Saved request inspector" }),
    ).toHaveTextContent("Saved contractor rail inspection");
    expect(
      screen.getByText(
        /Offline geography uses the bundled local station snapshot/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No matching station coordinates are available/),
    ).toBeInTheDocument();
  });
});
