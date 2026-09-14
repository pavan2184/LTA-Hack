"use client";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AdjustablePanel } from "./AdjustablePanel";
import {
  createLayoutStore,
  defaultLayout,
  type PanelId,
  type PanelPreference,
} from "./layout-preferences";
export interface PlanningPanelsProps {
  preferenceKey: string;
  variant?: "all" | "requests" | "resources";
  queue: ReactNode;
  primary: ReactNode;
  inspector: ReactNode;
  workforce: ReactNode;
  geography: ReactNode;
  belowPrimary?: ReactNode;
}
export function PlanningPanels(props: PlanningPanelsProps) {
  return <PanelLayout key={props.preferenceKey} {...props} />;
}
function PanelLayout({
  preferenceKey,
  variant = "all",
  queue,
  primary,
  inspector,
  workforce,
  geography,
  belowPrimary,
}: PlanningPanelsProps) {
  const [store] = useState(() => createLayoutStore(preferenceKey));
  const { layout, storageWarning } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    store.hydrate();
  }, [store]);
  const change =
    (id: PanelId) => (preference: PanelPreference, message: string) => {
      const current = store.getSnapshot().layout;
      store.update({
        ...current,
        panels: { ...current.panels, [id]: preference },
      });
      setAnnouncement(message);
    };
  const dimensions = {
    "--queue-width": `${layout.panels.queue.collapsed ? 84 : layout.panels.queue.size}px`,
    "--inspector-width": `${layout.panels.inspector.collapsed ? 84 : layout.panels.inspector.size}px`,
  } as CSSProperties;
  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-500">
          Panel layout is saved in this browser. Secondary panels stack on
          narrower screens.
        </p>
        <button
          type="button"
          onClick={() => {
            store.update(defaultLayout());
            setAnnouncement("Panel layout reset to defaults");
          }}
          className="rounded border border-rule-strong px-2 py-1 text-xs hover:bg-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Reset panel layout
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </p>
      {storageWarning && (
        <p className="text-xs text-ink-700">{storageWarning}</p>
      )}
      {variant === "requests" && (
        <div
          data-planning-grid
          style={dimensions}
          className="grid min-w-0 items-start gap-2.5 lg:grid-cols-[var(--queue-width)_var(--inspector-width)] lg:justify-between"
        >
          <AdjustablePanel
            id="queue"
            title="Queue"
            axis="width"
            preference={layout.panels.queue}
            onChange={change("queue")}
          >
            {queue}
          </AdjustablePanel>
          <AdjustablePanel
            id="inspector"
            title="Inspector"
            axis="width"
            preference={layout.panels.inspector}
            onChange={change("inspector")}
          >
            {inspector}
          </AdjustablePanel>
        </div>
      )}
      {variant === "resources" && (
        <div data-planning-grid className="min-w-0 space-y-2.5">
          <AdjustablePanel
            id="workforce"
            title="Workforce"
            axis="height"
            preference={layout.panels.workforce}
            onChange={change("workforce")}
          >
            {workforce}
          </AdjustablePanel>
          <AdjustablePanel
            id="geography"
            title="Geography"
            axis="height"
            preference={layout.panels.geography}
            onChange={change("geography")}
          >
            {geography}
          </AdjustablePanel>
        </div>
      )}
      {variant === "all" && (
        <div
          data-planning-grid
          style={dimensions}
          className="grid min-w-0 items-start gap-2.5 lg:grid-cols-[var(--queue-width)_minmax(0,1fr)] 2xl:grid-cols-[var(--queue-width)_minmax(0,1fr)_var(--inspector-width)]"
        >
          <AdjustablePanel
            id="queue"
            title="Queue"
            axis="width"
            preference={layout.panels.queue}
            onChange={change("queue")}
          >
            {queue}
          </AdjustablePanel>
          <div className="min-w-0 space-y-2.5">
            {primary}
            {belowPrimary}
            <AdjustablePanel
              id="workforce"
              title="Workforce"
              axis="height"
              preference={layout.panels.workforce}
              onChange={change("workforce")}
            >
              {workforce}
            </AdjustablePanel>
            <AdjustablePanel
              id="geography"
              title="Geography"
              axis="height"
              preference={layout.panels.geography}
              onChange={change("geography")}
            >
              {geography}
            </AdjustablePanel>
          </div>
          <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
            <AdjustablePanel
              id="inspector"
              title="Inspector"
              axis="width"
              preference={layout.panels.inspector}
              onChange={change("inspector")}
            >
              {inspector}
            </AdjustablePanel>
          </div>
        </div>
      )}
    </div>
  );
}
