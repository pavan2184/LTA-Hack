"use client";
import { useId, type ReactNode } from "react";
import {
  panelLimits,
  type PanelId,
  type PanelPreference,
} from "./layout-preferences";

export interface AdjustablePanelProps {
  id: PanelId;
  title: string;
  axis: "width" | "height";
  preference: PanelPreference;
  onChange: (preference: PanelPreference, announcement: string) => void;
  children: ReactNode;
  compact?: boolean;
}
export function AdjustablePanel({
  id,
  title,
  axis,
  preference,
  onChange,
  children,
  compact = false,
}: AdjustablePanelProps) {
  const bodyId = useId();
  const limits = panelLimits[id];
  const resize = (value: number) => {
    const size = Math.max(limits.min, Math.min(limits.max, Math.round(value)));
    onChange({ ...preference, size }, `${title} ${axis} ${size} pixels`);
  };
  return (
    <section
      aria-label={`${title} panel`}
      data-compact-panel={compact ? id : undefined}
      className="min-w-0 rounded border border-rule bg-surface"
    >
      <header className="flex flex-wrap items-center justify-between gap-1 border-b border-rule px-2 py-1.5">
        <h2 className="text-xs font-semibold">{title}</h2>
        <button
          type="button"
          aria-label={`${preference.collapsed ? "Expand" : "Collapse"} ${id} panel`}
          aria-expanded={!preference.collapsed}
          aria-controls={bodyId}
          onClick={() =>
            onChange(
              { ...preference, collapsed: !preference.collapsed },
              `${title} panel ${preference.collapsed ? "expanded" : "collapsed"}`,
            )
          }
          className="rounded px-2 py-1 text-xs hover:bg-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {preference.collapsed ? "+" : "−"}
        </button>
      </header>
      <div
        id={bodyId}
        hidden={preference.collapsed}
        inert={preference.collapsed}
      >
        <div
          className="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-auto"
          style={
            axis === "height"
              ? { height: preference.size }
                : id === "queue" && !compact
                ? { height: "max(420px, calc(100vh - 300px))" }
                : undefined
          }
        >
          {children}
        </div>
        <details open={compact ? undefined : true} className="panel-size-controls space-y-1 border-t border-rule px-2 py-2">
          <summary className={compact ? "cursor-pointer text-xs text-accent" : "hidden"}>Adjust {id} width</summary>
          <label className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {title} {axis}
            <input
              type="range"
              min={limits.min}
              max={limits.max}
              step={8}
              value={preference.size}
              aria-label={`${title} ${axis}`}
              aria-valuetext={`${preference.size} pixels`}
              onChange={(event) => resize(Number(event.target.value))}
              onKeyDown={(event) => {
                const delta = event.shiftKey ? 64 : 16;
                const value =
                  event.key === "Home"
                    ? limits.min
                    : event.key === "End"
                      ? limits.max
                      : ["ArrowRight", "ArrowUp"].includes(event.key)
                        ? preference.size + delta
                        : ["ArrowLeft", "ArrowDown"].includes(event.key)
                          ? preference.size - delta
                          : null;
                if (value !== null) {
                  event.preventDefault();
                  resize(value);
                }
              }}
              className="min-w-0 flex-1 accent-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            <span className="font-mono">{preference.size}px</span>
          </label>
          <p className="text-[10px] text-ink-500">
            Drag to resize, or use arrow keys. Home/End set limits.
            {axis === "width"
              ? " Width applies when docked beside the timeline."
              : ""}
          </p>
        </details>
      </div>
    </section>
  );
}
