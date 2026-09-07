import { beforeEach, describe, expect, it } from "vitest";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import { visiblePlanningInputs } from "@/store/visible-planning-inputs";
import { disruptionById } from "@railplan/core/data/disruptions";
import { assessWorkforce } from "@railplan/core/engine/workforce";

function currentInputs() {
  const state = useRailPlanStore.getState();
  return visiblePlanningInputs(
    state.activeResult(),
    state.activeDisruptionId ? disruptionById[state.activeDisruptionId] : null,
    state.hasReplanned,
  )!;
}

describe("displayed planning inputs", () => {
  beforeEach(async () => {
    useRailPlanStore.getState().reset();
    await useRailPlanStore.getState().load();
  });

  it("has no fabricated plan before loading", () => {
    expect(visiblePlanningInputs(null, null, false)).toBeNull();
  });

  it("shows exactly one emergency placement and its explicit staffing before and after replan", async () => {
    useRailPlanStore.getState().triggerDisruption("track-fault");
    for (const replan of [false, true]) {
      if (replan) await useRailPlanStore.getState().replan();
      const inputs = currentInputs();
      expect(
        inputs.plan.placements.filter((p) => p.requestId === "EM-001"),
      ).toHaveLength(1);
      expect(inputs.context.extraWorkforceDemand).toEqual(
        expect.arrayContaining([
          { requestId: "EM-001", roleId: "technician", count: 2 },
        ]),
      );
      expect(
        assessWorkforce(inputs.plan, inputs.context).missingRequestIds,
      ).toEqual([]);
    }
  });

  it("extends an overrun once and remains correct across requested/planned view changes", async () => {
    await useRailPlanStore.getState().buildPlan();
    const original = currentInputs().plan.placements.find(
      (p) => p.requestId === "M-008",
    )!;
    useRailPlanStore.getState().triggerDisruption("work-overrun");
    expect(
      currentInputs().plan.placements.find((p) => p.requestId === "M-008")!
        .endMinute,
    ).toBe(original.endMinute + 45);
    await useRailPlanStore.getState().replan();
    const solved = currentInputs().plan.placements.find(
      (p) => p.requestId === "M-008",
    )!;
    expect(solved.endMinute).toBe(original.endMinute + 45);
    useRailPlanStore.getState().setView("submitted");
    useRailPlanStore.getState().setView("planned");
    expect(
      currentInputs().plan.placements.find((p) => p.requestId === "M-008")!
        .endMinute,
    ).toBe(solved.endMinute);
  });

  it("uses new placements after strategy, pin, alternative and repair operations", async () => {
    await useRailPlanStore.getState().buildPlan();
    await useRailPlanStore.getState().setStrategy("min-risk");
    const placed = currentInputs().plan.placements[0];
    await useRailPlanStore.getState().toggleLock(placed.requestId);
    expect(
      currentInputs().plan.placements.find(
        (p) => p.requestId === placed.requestId,
      )?.locked,
    ).toBe(true);
    useRailPlanStore.getState().setView("submitted");
    const before = currentInputs().plan.placements.find(
      (p) => p.requestId === "M-013",
    )!.startMinute;
    useRailPlanStore.getState().applySuggestion("M-013", 60);
    expect(
      currentInputs().plan.placements.find((p) => p.requestId === "M-013")!
        .startMinute,
    ).toBe(60);
    expect(before).not.toBe(60);
    await useRailPlanStore.getState().applyAllSuggestions();
    const inputs = currentInputs();
    expect(assessWorkforce(inputs.plan, inputs.context).personMinutesUsed).toBe(
      useRailPlanStore.getState().activeResult()!.metrics.workforceUtilisation
        .numerator,
    );
  });

  it("withdraws supply in the displayed context at the exact outage boundary", () => {
    useRailPlanStore.getState().triggerDisruption("team-unavailable");
    const inputs = currentInputs();
    const assessment = assessWorkforce(inputs.plan, inputs.context);
    const after = assessment.intervals.filter(
      (row) => row.teamId === "T-ALP" && row.start >= 90,
    );
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((row) => row.available === 0)).toBe(true);
    expect(assessment.personMinutesUsed).toBe(
      useRailPlanStore.getState().disruptionMetrics!.workforceUtilisation
        .numerator,
    );
  });
});
