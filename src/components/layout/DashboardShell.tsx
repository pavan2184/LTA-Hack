"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, Route, ShieldCheck, Sparkles } from "lucide-react";
import { toast, Toaster } from "sonner";

import { StrategyControls } from "@/components/controls/StrategyControls";
import { DetailsPanel } from "@/components/insights/DetailsPanel";
import { TopNavigation } from "@/components/layout/TopNavigation";
import { MetricsGrid } from "@/components/metrics/MetricsGrid";
import { RequestQueue } from "@/components/requests/RequestQueue";
import { ScheduleTimeline } from "@/components/schedule/ScheduleTimeline";
import type { DashboardStatus } from "@/components/shared/StatusBadge";
import { LoadingOverlay } from "@/components/shared/LoadingOverlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { disruptionById } from "@/data/disruptionScenarios";
import { disruptionResponseSchedules } from "@/data/disruptionResponseSchedules";
import { useRailPlanStore } from "@/store/useRailPlanStore";

function InitialState() {
  const loadDemo = useRailPlanStore((state) => state.loadDemo);
  return (
    <main className="mx-auto flex min-h-[calc(100vh-68px)] max-w-[1920px] items-center justify-center px-5 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-950 text-cyan-300"><Route className="size-7" /></div>
        <Badge variant="info" className="mt-5">Frontend simulation · deterministic data</Badge>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950">Load the sample maintenance plan to begin.</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">Inspect 22 overnight work requests, resolve six feasibility conflicts, compare operational strategies, and test an emergency response.</p>
        <div className="mt-6 flex justify-center">
          <Button variant="primary" size="lg" onClick={loadDemo}>Load sample plan<ArrowRight className="size-4" /></Button>
        </div>
        <div className="mt-7 grid grid-cols-3 gap-3 border-t border-slate-100 pt-5 text-left">
          {["Explain every move", "Preserve planner control", "Replan disruptions"].map((label) => <div key={label} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><ShieldCheck className="size-3.5 text-emerald-600" />{label}</div>)}
        </div>
      </div>
    </main>
  );
}

function PlanHeader() {
  return (
    <section className="max-w-3xl pt-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">Planning workspace</p>
      <h1 className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-3xl">Overnight maintenance plan</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Review the engineering window, resolve only the constraints that matter, and keep every final move under planner control.
      </p>
    </section>
  );
}

function DisruptionBanner() {
  const activeDisruptionId = useRailPlanStore((state) => state.activeDisruptionId);
  const hasReplanned = useRailPlanStore((state) => state.hasReplanned);
  const isReplanning = useRailPlanStore((state) => state.isReplanning);
  const replan = useRailPlanStore((state) => state.replan);
  if (!activeDisruptionId) return null;
  const scenario = disruptionById[activeDisruptionId];
  const response = disruptionResponseSchedules[activeDisruptionId];

  const runReplan = async () => {
    await replan();
    toast.success("Emergency request accommodated. All safety constraints preserved.");
  };

  if (hasReplanned) {
    return (
      <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 text-emerald-700" />
            <div><p className="text-xs font-bold text-emerald-950">Response plan validated</p><p className="mt-0.5 text-[10px] text-emerald-800">{response.schedule.explanation}</p></div>
          </div>
          <div className="flex flex-wrap gap-1.5">{response.impactSummary.slice(1).map((item) => <Badge key={item} variant="success">{item}</Badge>)}</div>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-red-200 bg-red-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 text-red-600" />
          <div><p className="text-xs font-bold text-red-950">{scenario.title}: disruption detected</p><p className="mt-0.5 text-[10px] text-red-700">{scenario.warning} Robustness reduced to {scenario.degradedRobustness}/100.</p></div>
        </div>
        <Button variant="danger" size="sm" onClick={runReplan} disabled={isReplanning}><Sparkles className="size-3.5" />Replan Schedule</Button>
      </div>
    </motion.section>
  );
}

export function DashboardShell() {
  const loaded = useRailPlanStore((state) => state.isDemoLoaded);
  const currentView = useRailPlanStore((state) => state.currentView);
  const activeDisruptionId = useRailPlanStore((state) => state.activeDisruptionId);
  const hasReplanned = useRailPlanStore((state) => state.hasReplanned);
  const isOptimising = useRailPlanStore((state) => state.isOptimising);
  const optimisationStep = useRailPlanStore((state) => state.optimisationStep);
  const isReplanning = useRailPlanStore((state) => state.isReplanning);
  const loadDemo = useRailPlanStore((state) => state.loadDemo);
  const resetDemo = useRailPlanStore((state) => state.resetDemo);
  const railPlanState = useRailPlanStore();
  const schedule = railPlanState.getVisibleSchedule();
  const status: DashboardStatus = !loaded ? "Draft" : activeDisruptionId && !hasReplanned ? "Disruption detected" : currentView === "original" ? "Conflicts detected" : "Optimised";

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <TopNavigation status={status} onLoadDemo={loadDemo} onReset={resetDemo} loaded={loaded} />
      {!loaded ? <InitialState /> : (
        <main className="mx-auto max-w-[1680px] space-y-6 px-5 py-7 sm:px-6 lg:py-9">
          <div className="flex items-center justify-between gap-3 xl:hidden">
            <p className="text-xs font-semibold text-slate-600">16–20 September 2026</p>
            <Badge variant={status.includes("Disruption") ? "danger" : status === "Optimised" ? "success" : "warning"}>{status}</Badge>
          </div>
          <PlanHeader />
          <StrategyControls />
          <section className="space-y-3 pt-1">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Plan overview</h2>
              <p className="mt-1 text-xs text-slate-500">The four signals that determine whether tonight&apos;s plan is ready.</p>
            </div>
            <MetricsGrid metrics={schedule.metrics} original={currentView === "original"} />
          </section>
          <AnimatePresence>{activeDisruptionId && <DisruptionBanner />}</AnimatePresence>
          <div className="grid min-w-0 gap-4 xl:grid-cols-[270px_minmax(0,1fr)] 2xl:grid-cols-[270px_minmax(0,1fr)_320px]">
            <RequestQueue />
            <div className="min-w-0"><ScheduleTimeline /></div>
            <div className="min-w-0 xl:col-span-2 2xl:col-span-1"><DetailsPanel /></div>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 text-[10px] text-slate-400">
            <span>RailPlan prototype · simulated planning data · no operational decisions are executed</span>
            <span>Human approval required before schedule release</span>
          </footer>
        </main>
      )}
      {isOptimising && <LoadingOverlay mode="optimise" step={optimisationStep} />}
      {isReplanning && <LoadingOverlay mode="replan" step={1} />}
      <Toaster richColors position="top-right" />
    </div>
  );
}
