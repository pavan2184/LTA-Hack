"use client";

import { lines } from "@railplan/core/domain/network";
import { formatClock } from "@railplan/core/engine/intervals";
import type { PlannerPanelProps } from "./PlannerQueue";
import "./planner-panels.css";
import type { ReactNode } from "react";
import type { Violation } from "@railplan/core/types/railplan";
import { useTimelineDrag } from "./useTimelineDrag";

export function PlannerTimeline({ facts, plan, selectedRequestId, onSelectRequest, headerActions, label = "Saved block Gantt", violations = [], selectedViolationId, closedBlockIds = [], onMoveRequest, moveControls }: PlannerPanelProps & { headerActions?: ReactNode; label?: string; violations?: Violation[]; selectedViolationId?: string | null; closedBlockIds?: string[]; onMoveRequest?: (id: string, minute: number) => void; moveControls?: ReactNode }) {
  const selectedViolation = violations.find((v) => v.id === selectedViolationId);
  const requests = new Map(facts.requests.map((r) => [r.id, r]));
  const deferred = new Set(plan.deferred.map((r) => r.requestId));
  const occupations = plan.placements.flatMap((p) => {
    const request = requests.get(p.requestId);
    return request && !deferred.has(p.requestId) ? [{ ...p, request, clearEnd: p.endMinute + request.clearanceMinutes }] : [];
  });
  const start = Math.min(facts.window.startMinute, ...occupations.map((p) => p.startMinute));
  const end = Math.max(facts.window.endMinute, ...occupations.map((p) => p.clearEnd));
  const duration = Math.max(1, end - start);
  const drag = useTimelineDrag(plan, duration, facts.window.slotMinutes, onMoveRequest);
  const percent = (minute: number) => `${((minute - start) / duration) * 100}%`;
  const ticks = Array.from({ length: Math.floor(end / 30) - Math.ceil(start / 30) + 1 }, (_, i) => (Math.ceil(start / 30) + i) * 30);
  const grid = () => <>{ticks.map((tick) => <span key={tick} className={`rp-time-gridline ${tick % 60 === 0 ? "rp-time-gridline-hour" : ""}`} style={{ left: percent(tick) }} />)}<span className="rp-handback-line" style={{ left: percent(facts.window.endMinute) }} /></>;

  return <section className="rp-timeline" aria-label={label}>
    <header className="rp-panel-heading"><div><h3>Engineering timeline</h3><p>Work and clearance by track block</p></div>{headerActions ?? <span className="rp-timeline-scale">30 min grid</span>}</header>
    {moveControls}
    {drag.ghost && <p role="status" className="rp-selected-conflict">Proposed {drag.ghost.id}: {formatClock(drag.ghost.next)}. Release to validate; Escape to cancel.</p>}
    {selectedViolation && <p className="rp-selected-conflict" role="status">{selectedViolation.detail}</p>}
    <div className="rp-timeline-scroll" tabIndex={0} role="region" aria-label="Scrollable engineering timeline">
      <div className="rp-timeline-canvas">
        <div className="rp-timeline-axis"><span>Track block</span><div>{ticks.filter((tick) => tick % 60 === 0).map((tick) => <span className={`rp-hour-label ${tick === end ? "rp-hour-label-end" : ""}`} key={tick} style={{ left: percent(tick) }}>{formatClock(tick)}</span>)}<span className="rp-handback-label" style={{ left: percent(facts.window.endMinute) }}>Handback</span></div></div>
        {Object.values(lines).filter((line) => facts.blocks.some((b) => b.line === line.id)).map((line) => <div key={line.id} className="rp-corridor">
          <div className="rp-corridor-heading"><span className={`rp-line-chip rp-line-${line.id.toLowerCase()}`}>{line.id}</span><span>{line.name} corridor</span></div>
          {facts.blocks.filter((b) => b.line === line.id).map((block) => {
            const laneEnds: number[] = [];
            const packed = occupations.filter((p) => p.request.blockIds.includes(block.id)).sort((a, b) => a.startMinute - b.startMinute || a.requestId.localeCompare(b.requestId)).map((p) => {
              let lane = laneEnds.findIndex((laneEnd) => laneEnd <= p.startMinute);
              if (lane === -1) lane = laneEnds.length;
              laneEnds[lane] = p.clearEnd;
              return { ...p, lane };
            });
            return <div className="rp-block-row" key={block.id} data-block-id={block.id}><div className="rp-block-label">{block.id}{closedBlockIds.includes(block.id) && <span> · Closed</span>}</div><div className="rp-block-track" style={{ height: Math.max(1, laneEnds.length) * 35 + 8 }}>
              {grid()}
              {closedBlockIds.includes(block.id) && <span className="rp-unavailable" aria-hidden="true" />}
              {end > facts.window.endMinute && <span className="rp-unavailable" aria-hidden="true" style={{ left: percent(facts.window.endMinute) }} />}
              {packed.map((p) => {
                const label = `Select ${p.requestId} on ${block.id}, ${p.request.title}, ${formatClock(p.startMinute)}–${formatClock(p.endMinute)}, clearance ${p.request.clearanceMinutes} min until ${formatClock(p.clearEnd)}`;
                return <button {...drag.handlers(p)} type="button" className="rp-occupation" key={p.requestId} data-lane={p.lane} data-draggable={!!onMoveRequest && !p.locked || undefined} data-dragging={drag.ghost?.id === p.requestId || undefined} data-pinned={p.locked || undefined} data-conflict-selected={selectedViolation?.requestIds.includes(p.requestId) || undefined} aria-label={label} title={onMoveRequest && !p.locked ? `${label}. Drag horizontally or use Alt + Left/Right to propose a time.` : label} aria-pressed={selectedRequestId === p.requestId} onClick={() => { if (!drag.consumeClick()) onSelectRequest(p.requestId); }} style={{ left: percent(p.startMinute + (drag.ghost?.id === p.requestId ? drag.ghost.next - drag.ghost.start : 0)), width: `${((p.clearEnd - p.startMinute) / duration) * 100}%`, top: p.lane * 35 + 5 }}>
                  <span className="rp-work-bar" style={{ width: `${((p.endMinute - p.startMinute) / Math.max(1, p.clearEnd - p.startMinute)) * 100}%` }}><span>{p.requestId}</span><span>{p.request.shortTitle}</span></span>
                  {p.request.clearanceMinutes > 0 && <span className="rp-clearance-bar" data-clearance-end={p.clearEnd} style={{ width: `${(p.request.clearanceMinutes / Math.max(1, p.clearEnd - p.startMinute)) * 100}%` }} />}
                  {violations.filter((v) => v.window && v.requestIds.includes(p.requestId) && (!v.subjects.some((s) => facts.blocks.some((b) => b.id === s)) || v.subjects.includes(block.id))).map((v) => {
                    const from = Math.max(p.startMinute, v.window!.start);
                    const to = Math.min(p.clearEnd, v.window!.end);
                    return to > from ? <span key={v.id} className="rp-conflict-segment" title={v.detail} style={{ left: `${(from - p.startMinute) / (p.clearEnd - p.startMinute) * 100}%`, width: `${(to - from) / (p.clearEnd - p.startMinute) * 100}%` }} /> : null;
                  })}
                </button>;
              })}
            </div></div>;
          })}
        </div>)}
      </div>
    </div>
    <footer className="rp-timeline-legend"><span><i className="rp-legend-work" />Scheduled work</span><span><i className="rp-legend-clearance" />Clearance</span><span><i className="rp-legend-selection" />Selected request</span>{violations.length > 0 && <span>Striped red: minutes in conflict</span>}</footer>
  </section>;
}
