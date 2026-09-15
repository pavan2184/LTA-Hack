import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { buildWorld } from "@railplan/core/domain/world";
import { solve } from "@railplan/core/engine/solve";
import { makePlanExport } from "@/lib/exports/serialize";
import { SavedPlansWorkspace } from "@/components/plans/SavedPlansWorkspace";
import { SavedPlanReview } from "@/components/plans/SavedPlanReview";
import { previewRevision } from "@/lib/plans/revision";

const id = "11223344-1122-4122-8122-112233445566";
const requestId = "R-11223344-1122-4122-8122-112233445566";
function fixture(withUnplaceable = false) {
  const facts = structuredClone(buildInstanceFromLiterals());
  facts.requests = [requestId, "R-second"].map((id, index) => ({
    ...facts.requests[0], id, title: `Approved inspection ${index + 1}`, submissionRevision: 7,
    durationMinutes: 30, clearanceMinutes: 0, preferredStart: 30, earliestStart: 0,
    latestEnd: 240, dependencies: [], requiredSkills: [], equipment: [], mandatory: true,
  }));
  // Optional work longer than the whole engineering window: it can never fit and
  // must be reported as unplaced rather than hidden.
  if (withUnplaceable) facts.requests.push({ ...facts.requests[0], id: "R-long", title: "Overnight relay",
    priority: "low", mandatory: false, durationMinutes: 300, preferredStart: 0, latestEnd: 240 });
  facts.workforceDemand = facts.requests.map(r => ({ requestId: r.id,
    roleId: facts.workforceRoles[0].id, count: 1 }));
  const result = solve({ strategy: "balanced", context: { world: buildWorld(facts) } });
  return makePlanExport({ id, planningNight: facts.planningNight, facts, result,
    parameters: { planningNight: facts.planningNight, strategy: "balanced", locked: [] },
    sourceRevision: "1", currentSourceRevision: "1", inputDigest: "sha256:test",
    createdBy: "planner", createdAt: "2026-09-09T00:00:00Z", publishedAt: null, supersededBy: null });
}
afterEach(() => vi.unstubAllGlobals());
describe("saved planning revisions", () => {
  it.each(["solverVersion", "constraintVersion"] as const)("blocks an outdated browser %s even when the server reports current", async key => {
    const saved = fixture();
    saved.provenance[key] = "new-server-version";
    expect(saved.assessment.stale).toBe(false);
    expect(() => previewRevision(saved, [])).toThrow("Reload the page");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => saved }));
    render(<SavedPlanReview planId={id} onSaveRevision={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Review conflicts and revise" })).toBeDisabled();
    expect(screen.getByText(/Reload the page to use/)).toBeInTheDocument();
  });
  it("blocks saving incompatible requested times and recovers after unpinning", async () => {
    const saved = fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => saved }));
    render(<SavedPlanReview planId={id} onSaveRevision={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Review conflicts and revise" }));
    await userEvent.click(screen.getByRole("button", { name: "Try requested time" }));
    await userEvent.click(screen.getByRole("button", { name: "Open R-second, Approved inspection 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Try requested time" }));
    expect(screen.getByRole("button", { name: "Save as new draft" })).toBeDisabled();
    expect(screen.getByLabelText("Revision blockers")).toHaveTextContent("BLOCK_CAPACITY");
    await userEvent.click(screen.getByRole("button", { name: "Unpin placement" }));
    expect(screen.getByRole("button", { name: "Save as new draft" })).toBeEnabled();
    expect(screen.getByRole("status", { name: "Revision assessment" })).toHaveTextContent("1 pinned");
  });
  it("prevents publishing the saved version or losing choices while a revision is open", async () => {
    const snapshot = fixture();
    const saved = { ...snapshot.provenance, id, createdAt: snapshot.provenance.generatedAt,
      strategy: "balanced", publishState: "draft", validation: { independentlyValidated: true, violations: [] },
      placements: snapshot.placements, deferred: snapshot.deferrals, metrics: {}, objectives: [] };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(
      url.includes("/export?") ? snapshot : url.includes("?planningNight") ? { plans: [saved] } : { plan: saved })));
    render(<SavedPlansWorkspace />);
    await screen.findByRole("button", { name: "Review conflicts and revise" });
    await userEvent.click(screen.getByText(/^Version history/));
    await userEvent.click(screen.getByText("Create another draft"));
    expect(screen.getByRole("button", { name: "Publish this version" })).toBeEnabled();
    await userEvent.click(await screen.findByRole("button", { name: "Review conflicts and revise" }));
    for (const name of ["Publish this version", "Refresh versions", "Refresh saved review/status", "Generate and save plan"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: /Open version/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Pin proposed placement" }));
    expect(screen.getByRole("button", { name: "Save as new draft" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Discard revision preview" }));
    expect(screen.getByRole("button", { name: "Publish this version" })).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Plan revision" })).not.toBeInTheDocument();
    snapshot.assessment.stale = true;
    snapshot.assessment.sourceFreshness = "stale";
    await userEvent.click(screen.getByRole("button", { name: "Refresh saved review/status" }));
    await screen.findByText("Planning inputs have changed. Create a fresh draft before publishing.");
    expect(screen.getByRole("button", { name: "Publish this version" })).toBeDisabled();
    expect(screen.getByText("Create another draft").closest("details")).toHaveAttribute("open");
  });
  it("uses approved snapshot facts, preserves pins and exposes an impossible choice", () => {
    const saved = fixture();
    const pins = saved.placements.map(p => ({ requestId: p.requestId, teamId: p.teamId,
      startMinute: 30, endMinute: 60, locked: true }));
    const preview = previewRevision(saved, pins);
    expect(preview.feasible).toBe(false);
    expect(preview.result.violations.some(v => v.ruleId === "BLOCK_CAPACITY")).toBe(true);
    expect(preview.result.plan.placements).toEqual(pins);
    expect(preview.requestedViolations.flatMap(v => v.requestIds)).toContain(requestId);
    expect(preview.context.world.requests).toHaveLength(2);
    expect(saved.parameters.locked).toEqual([]);
  });
  it("reviews requested conflicts, chooses an alternative and saves its exact pin as a new version", async () => {
    const saved = fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => saved }));
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SavedPlanReview planId={id} onSaveRevision={onSave} />);
    await userEvent.click(await screen.findByRole("button", { name: "Review conflicts and revise" }));
    const editor = screen.getByRole("region", { name: "Plan revision" });
    expect(editor).toHaveTextContent("BLOCK_CAPACITY");
    expect(editor).toHaveTextContent("Approved inspection 1");
    expect(onSave).not.toHaveBeenCalled();
    const alternative = within(editor).getAllByRole("button", { name: /^Choose alternative/ })[0];
    await userEvent.click(alternative);
    expect(editor).toHaveTextContent("Pinned");
    expect(within(editor).getByRole("table", { name: "Proposed changes" })).toHaveTextContent(requestId);
    await userEvent.click(within(editor).getByRole("button", { name: "Save as new draft" }));
    expect(onSave).toHaveBeenCalledOnce();
    const input = onSave.mock.calls[0][0];
    expect(input).toMatchObject({ basedOnPlanId: id, planningNight: saved.provenance.planningNight,
      strategy: "balanced", locked: [{ requestId, teamId: saved.facts.requests[0].teamId, locked: true }] });
    expect(input.locked[0].startMinute).not.toBe(saved.placements[0].startMinute);
    expect(previewRevision(saved, input.locked).feasible).toBe(true);
    expect(saved.parameters.locked).toEqual([]);
  });
  it("lists requested-time conflicts with a recommended fix that becomes a pin", async () => {
    const saved = fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => saved }));
    render(<SavedPlanReview planId={id} onSaveRevision={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Review conflicts and revise" }));
    const conflicts = screen.getByRole("region", { name: "Requested-time conflicts" });
    expect(conflicts).toHaveTextContent("Track block capacity");
    expect(conflicts).toHaveTextContent(requestId);
    const rows = within(conflicts).getAllByRole("button", { expanded: false });
    await userEvent.click(rows[0]);
    expect(within(conflicts).getByText("Recommended resolution")).toBeInTheDocument();
    await userEvent.click(within(conflicts).getByRole("button", { name: "Apply suggestion" }));
    expect(screen.getByRole("status", { name: "Revision assessment" })).toHaveTextContent("1 pinned");
    expect(screen.getByRole("table", { name: "Proposed changes" })).toHaveTextContent("Unpinned → Pinned");
    expect(screen.getByRole("button", { name: "Save as new draft" })).toBeEnabled();
  });
  it("shows work without a slot beside the conflicts and opens it in the inspector", async () => {
    const saved = fixture(true);
    expect(saved.deferrals.map(d => d.requestId)).toEqual(["R-long"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => saved }));
    render(<SavedPlanReview planId={id} onSaveRevision={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Review conflicts and revise" }));
    const unplaced = screen.getByRole("region", { name: "Work without a slot" });
    expect(unplaced).toHaveTextContent("Overnight relay");
    expect(screen.getByRole("status", { name: "Revision assessment" })).toHaveTextContent("1 deferred");
    await userEvent.click(within(unplaced).getByRole("button", { name: "Review R-long" }));
    const inspector = screen.getByRole("region", { name: "Request inspector" });
    expect(inspector).toHaveTextContent("Overnight relay");
    expect(inspector).toHaveTextContent("No slot");
    expect(within(inspector).queryByRole("button", { name: "Pin proposed placement" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Needs action" }));
    const queue = screen.getByRole("region", { name: "Requests" });
    expect(within(queue).getAllByRole("button", { name: /^Open R-/ })).toHaveLength(1);
    expect(queue).toHaveTextContent("no slot");
  });
  it("explains a moved placement by what breaks at its requested time", async () => {
    const saved = fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => saved }));
    render(<SavedPlanReview planId={id} onSaveRevision={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Review conflicts and revise" }));
    const moved = saved.placements.find(p => p.startMinute !== 30)!;
    await userEvent.click(screen.getByRole("button", { name: new RegExp(`^Open ${moved.requestId},`) }));
    const inspector = screen.getByRole("region", { name: "Request inspector" });
    expect(inspector).toHaveTextContent("Why this placement");
    expect(within(inspector).getByRole("list", { name: "At the requested time" })).toHaveTextContent("Track block capacity");
    expect(inspector).toHaveTextContent(/min later/);
  });
  it("blocks stale snapshots and preserves edits when a save fails", async () => {
    const saved = fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => saved }));
    const onSave = vi.fn().mockRejectedValue(new Error("Inputs changed. Review again."));
    const view = render(<SavedPlanReview planId={id} onSaveRevision={onSave} />);
    await userEvent.click(await screen.findByRole("button", { name: "Review conflicts and revise" }));
    await userEvent.click(screen.getByRole("button", { name: "Pin proposed placement" }));
    await userEvent.click(screen.getByRole("button", { name: "Save as new draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Inputs changed");
    expect(screen.getByRole("button", { name: "Unpin placement" })).toBeInTheDocument();
    view.unmount();
    saved.assessment.stale = true;
    saved.assessment.sourceFreshness = "stale";
    render(<SavedPlanReview planId={id} onSaveRevision={onSave} />);
    expect(await screen.findByRole("button", { name: "Review conflicts and revise" })).toBeDisabled();
  });
});
