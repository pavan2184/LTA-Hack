import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import type { Plan, Placement } from "@railplan/core/types/railplan";

type Drag = { id: string; pointer: number; x: number; width: number; start: number; next: number; plan: Plan };
/** Pointer motion is a visual proposal only. The sandbox owns validation/commit. */
export function useTimelineDrag(plan: Plan, duration: number, slotMinutes: number, onMove?: (id: string, minute: number) => void) {
  const active = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [ghost, setGhost] = useState<Drag | null>(null);
  const clear = () => { active.current = null; setGhost(null); };
  const nextTime = (drag: Drag, x: number) => drag.start + Math.round(((x - drag.x) / drag.width * duration) / slotMinutes) * slotMinutes;
  return {
    ghost: ghost?.plan === plan && onMove ? ghost : null,
    handlers: (p: Placement) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (!onMove || p.locked || event.button !== 0 || event.pointerType === "touch") return;
        const width = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
        if (!width) return;
        active.current = { id: p.requestId, pointer: event.pointerId, x: event.clientX, width, start: p.startMinute, next: p.startMinute, plan };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const drag = active.current;
        if (!drag || drag.pointer !== event.pointerId || drag.plan !== plan) return;
        if (Math.abs(event.clientX - drag.x) < 5) return;
        const next = { ...drag, next: nextTime(drag, event.clientX) };
        active.current = next;
        setGhost(next);
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        const drag = active.current;
        clear();
        if (!drag || drag.pointer !== event.pointerId || drag.plan !== plan || !onMove) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        const next = nextTime(drag, event.clientX);
        if (Math.abs(event.clientX - drag.x) >= 5 && next !== drag.start) {
          suppressClick.current = true;
          onMove(drag.id, next);
        }
      },
      onPointerCancel: clear,
      onLostPointerCapture: clear,
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Escape") { clear(); return; }
        if (!onMove || p.locked || !event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        onMove(p.requestId, p.startMinute + (event.key === "ArrowRight" ? slotMinutes : -slotMinutes));
      },
    }),
    consumeClick: () => { const skip = suppressClick.current; suppressClick.current = false; return skip; },
  };
}
