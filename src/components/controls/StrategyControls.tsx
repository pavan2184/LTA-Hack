"use client";

import { GitCompareArrows, ListChecks, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DisruptionModal } from "@/components/disruption/DisruptionModal";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import type { StrategyId } from "@/types/railplan";

const strategies: { id: StrategyId; label: string; description: string }[] = [
  { id: "balanced", label: "Balanced", description: "Protect critical work with practical buffers." },
  { id: "max-completion", label: "Maximum completion", description: "Place the most work within the window." },
  { id: "min-risk", label: "Minimum risk", description: "Keep larger resource and handback buffers." },
  { id: "min-changes", label: "Minimum changes", description: "Stay closest to submitted placements." },
  { id: "emergency-buffer", label: "Emergency reserve", description: "Keep capacity open for urgent work." },
];

export function StrategyControls() {
  const [disruptionOpen, setDisruptionOpen] = useState(false);
  const selectedStrategy = useRailPlanStore((state) => state.selectedStrategy);
  const currentView = useRailPlanStore((state) => state.currentView);
  const changeStrategy = useRailPlanStore((state) => state.changeStrategy);
  const optimise = useRailPlanStore((state) => state.optimise);
  const isOptimising = useRailPlanStore((state) => state.isOptimising);
  const loaded = useRailPlanStore((state) => state.isDemoLoaded);
  const selected = strategies.find((strategy) => strategy.id === selectedStrategy) ?? strategies[0];
  const schedule = useRailPlanStore().getVisibleSchedule();

  const runOptimisation = async () => {
    await optimise();
    const result = useRailPlanStore.getState().getVisibleSchedule();
    toast.success(`Recommendation ready: ${result.metrics.scheduledJobs}/${result.metrics.totalJobs} jobs placed.`);
  };

  const setView = (view: "original" | "optimised") => {
    useRailPlanStore.setState({ currentView: view, activeDisruptionId: null, hasReplanned: false });
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <SlidersHorizontal className="size-4 text-cyan-700" />
          Planning objective
        </div>
        <div className="min-w-[230px]">
          <select
            aria-label="Planning objective"
            value={selectedStrategy}
            onChange={(event) => changeStrategy(event.target.value as StrategyId)}
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-cyan-600/30"
          >
            {strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">{selected.description}</p>
        </div>
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5" aria-label="Compare plan versions">
          <button type="button" aria-pressed={currentView === "original"} onClick={() => setView("original")} className={cn("rounded-md px-3 py-1.5 text-xs font-bold", currentView === "original" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>Submitted</button>
          <button type="button" aria-pressed={currentView === "optimised"} onClick={() => setView("optimised")} className={cn("rounded-md px-3 py-1.5 text-xs font-bold", currentView === "optimised" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500")}>
            <GitCompareArrows className="mr-1 inline size-3" />Recommended
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {currentView !== "disrupted" && <Button variant="outline" onClick={() => setDisruptionOpen(true)} disabled={!loaded}>
          <ShieldAlert className="size-4 text-red-600" />Test disruption
        </Button>}
        {currentView !== "disrupted" && <Button variant="primary" onClick={runOptimisation} disabled={!loaded || isOptimising}>
          <ListChecks className="size-4" />
          {currentView === "original" ? `Resolve conflicts (${schedule.metrics.activeConflicts})` : "Rebuild recommendation"}
        </Button>}
      </div>
      <DisruptionModal open={disruptionOpen} onOpenChange={setDisruptionOpen} />
    </section>
  );
}
