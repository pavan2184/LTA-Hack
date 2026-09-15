"use client";
import { useState, type ComponentProps } from "react";
import { PlannerTimeline } from "@/components/plans/PlannerTimeline";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import { applyTimelineMove, previewTimelineMove, sameTimelinePlan, undoTimelineMove, type TimelineMovePreview, type TimelineMoveUndo } from "@/store/timeline-move";
import { formatClock } from "@railplan/core/engine/intervals";

export function SandboxTimeline(props: ComponentProps<typeof PlannerTimeline>) {
  const state = useRailPlanStore();
  const [pending, setPending] = useState<TimelineMovePreview | null>(null);
  const [undo, setUndo] = useState<TimelineMoveUndo | null>(null);
  const [notice, setNotice] = useState("");
  const preview = pending && sameTimelinePlan(state, pending.source) ? pending : null;
  const canUndo = undo && sameTimelinePlan(state, undo.after);
  const enabled = state.view === "planned" && !!state.planned && state.stage === "idle" && (!state.activeDisruptionId || state.hasReplanned);
  const othersMoved = preview?.result?.plan.placements.filter((p) => p.requestId !== preview.requestId && preview.source.planned?.plan.placements.find((old) => old.requestId === p.requestId)?.startMinute !== p.startMinute).length ?? 0;
  return <PlannerTimeline {...props} onMoveRequest={enabled ? (id, minute) => {
    state.selectRequest(id); setNotice(""); setPending(previewTimelineMove(id, minute));
  } : undefined} moveControls={<div className="rp-move-controls">
    <p>{enabled ? `Drag unpinned work horizontally (${props.facts.window.slotMinutes}-minute steps), or focus a bar and press Alt + Left/Right. On touch screens, use the inspector’s alternative slots.` : "Generate a draft, and replan any pending disruption, to enable dragging."}</p>
    {preview && <section aria-label="Move preview" aria-live="polite">
      <strong>{preview.requestId} → {formatClock(preview.startMinute)}</strong>
      {preview.error ? <p role="alert">{preview.error}</p> : <p>Validated preview: {othersMoved} other requests move; {preview.result!.plan.deferred.length} requests deferred in total. Applying pins this time. All linked track blocks and clearance move together.</p>}
      <div className="flex flex-wrap gap-2 mt-2">
        <button type="button" className="planner-button primary" disabled={!!preview.error} onClick={() => {
          const token = applyTimelineMove(preview);
          setPending(null); setUndo(token); setNotice(token ? "Move applied to the demo draft." : "The draft changed. Preview this move again.");
        }}>Apply move</button>
        <button type="button" className="planner-button" onClick={() => setPending(null)}>Cancel move</button>
      </div>
    </section>}
    {notice && <p role="status">{notice}</p>}
    {canUndo && <button type="button" className="planner-button" onClick={() => {
      const restored = undoTimelineMove(undo); setUndo(null); setPending(null);
      setNotice(restored ? "Previous draft restored." : "The draft changed; Undo is no longer available.");
    }}>Undo move</button>}
  </div>} />;
}
