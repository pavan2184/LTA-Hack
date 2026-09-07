export type PanelId = "queue" | "inspector" | "workforce" | "geography";
export interface PanelPreference {
  size: number;
  collapsed: boolean;
}
export interface LayoutPreference {
  version: 1;
  panels: Record<PanelId, PanelPreference>;
}
export const panelLimits: Record<PanelId, { min: number; max: number }> = {
  queue: { min: 200, max: 360 },
  inspector: { min: 280, max: 480 },
  workforce: { min: 240, max: 720 },
  geography: { min: 280, max: 880 },
};
export function defaultLayout(): LayoutPreference {
  return {
    version: 1,
    panels: {
      queue: { size: 248, collapsed: false },
      inspector: { size: 368, collapsed: false },
      workforce: { size: 360, collapsed: false },
      geography: { size: 520, collapsed: false },
    },
  };
}
export function decodeLayout(raw: string | null): LayoutPreference {
  const fallback = defaultLayout();
  if (!raw || raw.length > 4096) return fallback;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !value.panels) return fallback;
    const decoded = defaultLayout();
    for (const id of Object.keys(panelLimits) as PanelId[]) {
      const panel = value.panels[id];
      if (
        typeof panel?.size !== "number" ||
        !Number.isFinite(panel.size) ||
        typeof panel.collapsed !== "boolean"
      )
        return fallback;
      decoded.panels[id] = {
        size: Math.max(
          panelLimits[id].min,
          Math.min(panelLimits[id].max, Math.round(panel.size)),
        ),
        collapsed: panel.collapsed,
      };
    }
    return decoded;
  } catch {
    return fallback;
  }
}

/** An instance-local preference store keeps SSR defaults stable and survives
 * unavailable browser storage without blocking panel interaction. */
export function createLayoutStore(key: string) {
  const initial = { layout: defaultLayout(), storageWarning: "" };
  let snapshot = initial;
  let storage: Storage | null = null;
  const listeners = new Set<() => void>();
  function notify() {
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hydrate: () => {
      try {
        storage = window.localStorage;
        snapshot = {
          layout: decodeLayout(storage.getItem(`${key}:v1`)),
          storageWarning: "",
        };
      } catch {
        snapshot = {
          ...snapshot,
          storageWarning:
            "Layout preferences cannot be loaded or saved in this browser. Changes remain available for this visit.",
        };
      }
      notify();
    },
    update: (layout: LayoutPreference) => {
      let storageWarning = "";
      try {
        if (!storage) throw new Error("Storage unavailable");
        storage.setItem(`${key}:v1`, JSON.stringify(layout));
      } catch {
        storageWarning =
          "Layout preferences cannot be saved in this browser. Changes remain available for this visit.";
      }
      snapshot = { layout, storageWarning };
      notify();
    },
  };
}
