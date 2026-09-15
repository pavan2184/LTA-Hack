import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { solve } from "@railplan/core/engine/solve";
import { makePlanExport } from "@/lib/exports/serialize";
import { comparePlans } from "@/lib/plans/comparison";
import { PlanComparison } from "@/components/plans/PlanComparison";

function fixture() {
  const facts = buildInstanceFromLiterals();
  return makePlanExport({ id: "base", planningNight: facts.planningNight, sourceRevision: "1", currentSourceRevision: "1", inputDigest: "saved", facts, parameters: { planningNight: facts.planningNight, strategy: "balanced", locked: [] }, result: solve({ strategy: "balanced" }), createdBy: "planner", createdAt: "2026-09-14T00:00:00Z", publishedAt: null, supersededBy: null });
}
describe("immutable version comparison", () => {
  it("finds simultaneous moves, reassignment and revision changes without mutating saved versions", () => {
    const base = fixture(), target = structuredClone(base);
    const saved = JSON.stringify(base);
    const placement = target.placements[0];
    placement.startMinute += 15;
    placement.endMinute += 15;
    placement.teamId = "other";
    target.facts.requests.find((r) => r.id === placement.requestId)!.submissionRevision = 4;
    const diff = comparePlans(base, target);
    expect(diff.changes.find((r) => r.requestId === placement.requestId)).toMatchObject({ kinds: ["moved", "reassigned", "revised"], changedFacts: ["submissionRevision"] });
    expect(JSON.stringify(base)).toBe(saved);
  });
  it("includes scheduling additions/removals, fact changes without revision, and deferred reason changes", () => {
    const base = fixture(), target = structuredClone(base);
    const removed = target.placements.shift()!;
    const added = target.deferrals.shift()!;
    target.placements.push({ ...added, startMinute: 0, endMinute: 15, teamId: "team", locked: false });
    target.facts.requests.find((r) => r.id === removed.requestId)!.description += " revised";
    target.deferrals[0].reason = "Different saved reason";
    const diff = comparePlans(base, target);
    expect(diff.changes.find((r) => r.requestId === removed.requestId)?.kinds).toEqual(["removed", "revised"]);
    expect(diff.changes.find((r) => r.requestId === added.requestId)?.kinds).toContain("added");
    expect(diff.changes.find((r) => r.requestId === target.deferrals[0].requestId)?.kinds).toContain("deferral");
  });
  it("renders saved metric deltas and rejects a different night", () => {
    const base = fixture(), target = structuredClone(base);
    target.metrics.placed.value += 1;
    expect(comparePlans(base, target).metrics.find((r) => r.key === "placed")?.delta).toBe(1);
    render(<PlanComparison base={base} target={target} />);
    expect(screen.getByText("No request or placement differences.")).toBeInTheDocument();
    target.provenance.planningNight = "2026-10-01";
    expect(() => comparePlans(base, target)).toThrow("same engineering night");
  });
});
