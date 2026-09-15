"use client";
import {
  useEffect,
  useId,
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
  queue: ReactNode;
  primary: ReactNode | ((headerActions: ReactNode) => ReactNode);
  inspector: ReactNode;
  workforce: ReactNode;
  geography: ReactNode;
  belowPrimary?: ReactNode;
  compactContext?: boolean;
}
export function PlanningPanels(props: PlanningPanelsProps) {
  return <PanelLayout key={props.preferenceKey} {...props} />;
}
function PanelLayout({
  preferenceKey,
  queue,
  primary,
  inspector,
  workforce,
  geography,
  belowPrimary,
  compactContext,
}: PlanningPanelsProps) {
  const [contextTab, setContextTab] = useState("Workforce");
  const tabsId = useId();
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
  const contextTabs = <div role="tablist" aria-label="Timeline context" className="planner-tabs">
    {["Workforce", "Geography"].map((tab, index, tabs) => <button key={tab} role="tab" id={`${tabsId}-${tab}`} aria-controls={`${tabsId}-${tab}-panel`} aria-selected={contextTab === tab} tabIndex={contextTab === tab ? 0 : -1} onClick={() => setContextTab(tab)} onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[1] : tabs[(index + 1) % tabs.length];
      setContextTab(next); document.getElementById(`${tabsId}-${next}`)?.focus();
    }}>{tab}</button>)}
    <a className="py-2 text-xs text-accent" href="#sandbox-calculations">Calculations</a>
  </div>;
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
      <div
        data-planning-grid
        style={dimensions}
        className="grid min-w-0 items-start gap-2.5 lg:grid-cols-[var(--queue-width)_minmax(0,1fr)] 2xl:grid-cols-[var(--queue-width)_minmax(0,1fr)_var(--inspector-width)]"
      >
        <AdjustablePanel
          id="queue"
          title={compactContext ? "Work requests" : "Queue"}
          compact={compactContext}
          axis="width"
          preference={layout.panels.queue}
          onChange={change("queue")}
        >
          {queue}
        </AdjustablePanel>
        {compactContext ? <div className="sandbox-center planner-center">
          {typeof primary !== "function" && contextTabs}
          {typeof primary === "function" ? primary(contextTabs) : <div className="sandbox-timeline">{primary}</div>}
          {[{ label: "Workforce", content: workforce }, { label: "Geography", content: geography }].map(({ label, content }) => <div key={label} role="tabpanel" tabIndex={0} id={`${tabsId}-${label}-panel`} aria-labelledby={`${tabsId}-${label}`} hidden={contextTab !== label} inert={contextTab !== label} className="sandbox-context-body" data-view={label}>{content}</div>)}
        </div> : <div className="min-w-0 space-y-2.5">
          {typeof primary === "function" ? primary(null) : primary}
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
        </div>}
        <div className="min-w-0 lg:col-span-2 2xl:col-span-1">
          <AdjustablePanel
            id="inspector"
            title={compactContext ? "Request details" : "Inspector"}
            compact={compactContext}
            axis="width"
            preference={layout.panels.inspector}
            onChange={change("inspector")}
          >
            {inspector}
          </AdjustablePanel>
        </div>
      </div>
      {compactContext && belowPrimary}
    </div>
  );
}
