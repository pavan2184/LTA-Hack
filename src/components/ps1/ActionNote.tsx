import type { ReactNode } from "react";

/**
 * The one line under a control that says what pressing it will do.
 *
 * Every action on this page changes a schedule someone is about to be judged
 * on, and several of them — adopting a replan, pinning a week — are not obvious
 * from the label alone. The note is rendered rather than hidden in a `title`
 * so it is readable without a mouse, and each control points at its own note
 * with `aria-describedby` so it is announced with the button rather than
 * floating loose in the document.
 */
export function ActionNote({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="max-w-[17rem] text-[11px] leading-snug text-ink-400">
      {children}
    </p>
  );
}
