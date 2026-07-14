"use client";

import { GitCompareArrows, Play, ShieldAlert, SlidersHorizontal, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DisruptionModal } from "@/components/disruption/DisruptionModal";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import type { StrategyId } from "@/types/railplan";

const strategies: { id: StrategyId; label: string }[] = [
  { id: "balanced", label: "Balanced" },
  { id: "max-completion", label: "Maximum Work Completion" },
  { id: "min-risk", label: "Minimum Operational Risk" },
  { id: "min-changes", label: "Minimum Schedule Changes" },
  { id: "emergency-buffer", label: "Maximum Emergency Buffer" },
];

export function StrategyControls() {
  const [disruptionOpen, setDisruptionOpen] = useState(false);
  const selectedStrategy = useRailPlanStore((state) => state.selectedStrategy);
  const currentView = useRailPlanStore((state) => state.currentView);
  const changeStrategy = useRailPlanStore((state) => state.changeStrategy);
  const optimise = useRailPlanStore((state) => state.optimise);
  const isOptimising = useRailPlanStore((state) => state.isOptimising);
  const loaded = useRailPlanStore((state) => state.isDemoLoaded);

  const runOptimisation = async () => {
    await optimise();
    toast.success("6 conflicts resolved. 3 requests rescheduled.");
  };

  const setView = (view: "original" | "optimised") => {
    useRailPlanStore.setState({ currentView: view, activeDisruptionId: null, hasReplanned: false });
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <SlidersHorizontal className="size-4 text-cyan-700" />
          Optimisation strategy
        </div>
        <select
          aria-label="Optimisation strategy"
          value={selectedStrategy}
          onChange={(event) => changeStrategy(event.target.value as StrategyId)}
          className="h-9 min-w-[220px] rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-cyan-600/30"
        >
          {strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.label}</option>)}
        </select>
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5" aria-label="Compare schedule views">
          <button type="button" onClick={() => setView("original")} className={cn("rounded-md px-2.5 py-1.5 text-xs font-bold", currentView === "original" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>Original</button>
          <button type="button" onClick={() => setView("optimised")} className={cn("rounded-md px-2.5 py-1.5 text-xs font-bold", currentView === "optimised" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500")}>
            <GitCompareArrows className="mr-1 inline size-3" />Optimised
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => setDisruptionOpen(true)} disabled={!loaded}>
          <ShieldAlert className="size-4 text-red-600" />Simulate Disruption
        </Button>
        <Button variant="primary" onClick={runOptimisation} disabled={!loaded || isOptimising}>
          {isOptimising ? <Sparkles className="size-4 animate-pulse" /> : <Play className="size-4" />}
          Optimise Schedule
        </Button>
      </div>
      <DisruptionModal open={disruptionOpen} onOpenChange={setDisruptionOpen} />
    </section>
  );
}
