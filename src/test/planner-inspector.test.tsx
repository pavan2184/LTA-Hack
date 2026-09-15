import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { solve } from "@railplan/core/engine/solve";
import type { PlanExport } from "@railplan/core/types/exports";
import type { PlanInspection } from "@/lib/plans/workspace-types";
import { PlannerInspector } from "@/components/plans/PlannerInspector";

function fixture() {
  const facts = buildInstanceFromLiterals();
  const result = solve({ strategy: "balanced" });
  const request = facts.requests.find((r) => r.id === result.plan.placements[0].requestId)!;
  const snapshot: PlanExport = {
    exportVersion: 1, notice: "Prototype", facts,
    assessment: { nonOperational: true, publicationState: "draft", sourceFreshness: "current", stale: false, engineVersionMatch: true, currentSourceRevision: "1", warnings: [], publishedAt: null, supersededBy: null },
    provenance: { planId: "saved-id", planningNight: facts.planningNight, sourceRevision: "1", inputDigest: "digest", solverVersion: result.solverVersion, constraintVersion: result.constraintVersion, strategy: "balanced", status: result.status, independentlyValidated: true, generatedAt: "2026-09-14", createdBy: "planner", solveMs: 1, candidatesEvaluated: 1 },
    parameters: { planningNight: facts.planningNight, strategy: "balanced", locked: [] },
    placements: [], deferrals: [], metrics: result.metrics, objectives: result.objective, validation: { independentlyValidated: true, violations: [] },
  };
  const inspection: PlanInspection = { operation: "inspect", requestId: request.id, result, parameters: snapshot.parameters, stale: false, currentSourceRevision: "1", basis: { planId: "saved-id", sourceRevision: "1", solverVersion: result.solverVersion, constraintVersion: result.constraintVersion, inputDigest: "digest" }, explanation: { requestId: request.id, requestedStart: request.preferredStart, placedStart: result.plan.placements[0].startMinute, movedMinutes: 0, blockers: [], facts: [], summary: "Server explanation for selected work." }, alternatives: [{ id: "alternative", requestId: request.id, startMinute: 90, endMinute: 120, feasible: true, displacedRequestIds: [], movementMinutesDelta: 0, weightedCompletionDelta: 0, bindingRuleId: null, summary: "Alternative", whyItWorks: "Validated slot", impact: "No displacement" }], bindingRuleId: null };
  return { snapshot, inspection, request, props: { snapshot, plan: result.plan, preview: null, selectedRequestId: request.id, disabled: false, onPin: vi.fn(), onUnpin: vi.fn(), onSelectRequest: vi.fn() } };
}

afterEach(() => vi.unstubAllGlobals());

describe("Planner inspector", () => {
  it("proposes the requested time using the saved request's team and duration", async () => {
    const { props, inspection, request } = fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => inspection }));
    render(<PlannerInspector {...props} />);
    await screen.findByText(inspection.explanation.summary);
    await userEvent.click(screen.getByRole("button", { name: "Try requested time" }));
    expect(props.onPin).toHaveBeenCalledExactlyOnceWith({ requestId: request.id, teamId: request.teamId, startMinute: request.preferredStart, endMinute: request.preferredStart + request.durationMinutes, locked: true });
  });
  it.each(["stale", "superseded", "busy", "loading"])("blocks requested-time proposals while %s", async (state) => {
    const { props, inspection } = fixture();
    if (state === "stale") props.snapshot.assessment.stale = true;
    if (state === "superseded") props.snapshot.assessment.publicationState = "superseded";
    if (state === "busy") props.disabled = true;
    vi.stubGlobal("fetch", vi.fn(() => state === "loading" ? new Promise(() => {}) : Promise.resolve({ ok: true, json: async () => inspection })));
    render(<PlannerInspector {...props} />);
    if (state !== "loading") await screen.findByText(inspection.explanation.summary);
    expect(screen.getByRole("button", { name: "Try requested time" })).toBeDisabled();
  });
  it("requires unpinning before trying the requested time", async () => {
    const { props, inspection } = fixture();
    props.snapshot.parameters.locked = [props.plan.placements[0]];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => inspection }));
    render(<PlannerInspector {...props} />);
    await screen.findByText(inspection.explanation.summary);
    expect(screen.queryByRole("button", { name: "Try requested time" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpin request" })).toBeEnabled();
  });
  it("links an approved saved request back to its exact intake record without losing plan context", () => {
    const { props, request } = fixture();
    const id = "9a494154-2b92-4890-8b8a-8a522254fe42";
    request.id = `R-${id}`;
    request.submissionRevision = 3;
    props.selectedRequestId = request.id;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<PlannerInspector {...props} />);
    expect(screen.getByRole("link", { name: "Open submitted request" })).toHaveAttribute("href", `/requests?planningNight=${props.snapshot.provenance.planningNight}&request=${id}&plan=saved-id&planRequest=R-${id}`);
  });
  it("loads server analysis and passes exact alternative placement to the parent", async () => {
    const { props, inspection, request } = fixture();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => inspection });
    vi.stubGlobal("fetch", fetchMock);
    render(<PlannerInspector {...props} />);
    expect(await screen.findByText(inspection.explanation.summary)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ operation: "inspect", requestId: request.id });
    await userEvent.click(screen.getByRole("button", { name: /01:30–02:00/ }));
    expect(props.onPin).toHaveBeenCalledWith({ requestId: request.id, startMinute: 90, endMinute: 120, teamId: request.teamId, locked: true });
  });

  it("blocks revision of stale saved versions", async () => {
    const { props, inspection } = fixture();
    props.snapshot.assessment.stale = true;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => inspection }));
    render(<PlannerInspector {...props} />);
    await screen.findByText(inspection.explanation.summary);
    expect(screen.getByRole("button", { name: "Pin this time" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /01:30–02:00/ })).toBeDisabled();
  });

  it("ignores an obsolete response after request selection changes", async () => {
    const { props, inspection } = fixture();
    let resolveFirst!: (value: unknown) => void;
    const secondId = props.snapshot.facts.requests.find((r) => r.id !== props.selectedRequestId)!.id;
    vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValue({ ok: true, json: async () => ({ ...inspection, requestId: secondId, explanation: { ...inspection.explanation, summary: "Second request explanation" }, alternatives: [] }) }));
    const { rerender } = render(<PlannerInspector {...props} />);
    rerender(<PlannerInspector {...props} selectedRequestId={secondId} />);
    await screen.findByText("Second request explanation");
    await act(async () => { resolveFirst({ ok: true, json: async () => inspection }); });
    expect(screen.queryByText(inspection.explanation.summary)).not.toBeInTheDocument();
    expect(screen.getByText("Second request explanation")).toBeInTheDocument();
    expect(screen.getByText("No valid alternative slots are available.")).toBeInTheDocument();
  });
});
