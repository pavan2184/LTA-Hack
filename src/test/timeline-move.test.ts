import { beforeEach, expect, it } from "vitest";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import { previewTimelineMove, applyTimelineMove, undoTimelineMove } from "@/store/timeline-move";

beforeEach(async () => {
  useRailPlanStore.getState().reset();
  await useRailPlanStore.getState().load();
  await useRailPlanStore.getState().buildPlan();
});
it("previews a whole-request move without mutation, applies validated output and restores exact output on Undo", () => {
  const before = useRailPlanStore.getState();
  const preview = previewTimelineMove("M-001", 15);
  expect(preview.error).toBeNull();
  expect(useRailPlanStore.getState().planned).toBe(before.planned);
  expect(preview.result?.plan.placements.find((p) => p.requestId === "M-001")).toMatchObject({ startMinute: 15, endMinute: 75 });
  const undo = applyTimelineMove(preview);
  expect(undo).not.toBeNull();
  expect(useRailPlanStore.getState().planned?.independentlyValidated).toBe(true);
  expect(useRailPlanStore.getState().locked["M-001"].startMinute).toBe(15);
  expect(undoTimelineMove(undo!)).toBe(true);
  expect(useRailPlanStore.getState().planned).toBe(before.planned);
  expect(useRailPlanStore.getState().locked).toEqual(before.locked);
});
it("rejects off-grid, out-of-window, pinned and scenario-forced moves", async () => {
  for (const time of [NaN, 1, -15, 240]) expect(previewTimelineMove("M-001", time).error).toBeTruthy();
  await useRailPlanStore.getState().toggleLock("M-001");
  expect(previewTimelineMove("M-001", 15).error).toMatch(/pin/i);
  useRailPlanStore.getState().triggerDisruption("track-fault");
  expect(previewTimelineMove("M-008", 30).error).toBeTruthy();
  await useRailPlanStore.getState().replan();
  expect(previewTimelineMove("EM-001", 30).error).toBeTruthy();
});
it("refuses stale previews and never undoes later planning changes", async () => {
  const preview = previewTimelineMove("M-001", 15);
  await useRailPlanStore.getState().setStrategy("min-risk");
  expect(applyTimelineMove(preview)).toBeNull();
  await useRailPlanStore.getState().setStrategy("balanced");
  const undo = applyTimelineMove(previewTimelineMove("M-001", 15));
  expect(undo).not.toBeNull();
  useRailPlanStore.getState().triggerDisruption("track-fault");
  expect(undoTimelineMove(undo!)).toBe(false);
  expect(useRailPlanStore.getState().activeDisruptionId).toBe("track-fault");
});
