"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Route, ShieldCheck } from "lucide-react";
import { toast, Toaster } from "sonner";

import { StrategyControls } from "@/components/controls/StrategyControls";
import { DetailsPanel } from "@/components/insights/DetailsPanel";
import { TopNavigation } from "@/components/layout/TopNavigation";
import { MetricsGrid } from "@/components/metrics/MetricsGrid";
import { RequestQueue } from "@/components/requests/RequestQueue";
import { ScheduleTimeline } from "@/components/schedule/ScheduleTimeline";
import { StatusBadge, type DashboardStatus } from "@/components/shared/StatusBadge";
import { LoadingOverlay } from "@/components/shared/LoadingOverlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { disruptionById } from "@/data/disruptionScenarios";
import { disruptionResponseSchedules } from "@/data/disruptionResponseSchedules";
import { useRailPlanStore } from "@/store/useRailPlanStore";

function InitialState() {
  const loadDemo = useRailPlanStore((state) => state.loadDemo);
  return (
    <main className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1920px] items-center justify-center px-5 py-10">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-slate-950 text-cyan-300"><Route className="size-6" /></div>
        <Badge variant="info" className="mt-5">Sample data · deterministic simulation</Badge>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-950">Turn competing requests into one reviewable plan.</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">Start with 22 overnight work requests across six sectors. Review declared conflicts, protect critical work, and compare planner-controlled responses.</p>
        <div className="mt-6 flex justify-center">
          <Button variant="primary" size="lg" onClick={loadDemo}>Load sample requests<ArrowRight className="size-4" /></Button>
        </div>
        <div className="mt-7 grid gap-3 border-t border-slate-100 pt-5 text-left sm:grid-cols-3">
          {["Track and access", "Teams and equipment", "Planner-approved changes"].map((label) => <div key={label} className="flex items-center gap-2 text-xs font-semibold text-slate-600"><ShieldCheck className="size-4 text-emerald-600" />{label}</div>)}
        </div>
      </div>
    </main>
  );
}

function PlanHeader() {
  return (
    <section className="flex flex-col gap-3 pt-1 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">Planning night</p>
        <h1 className="mt-1.5 text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-3xl">Overnight engineering plan</h1>
        <p className="mt-1.5 text-sm text-slate-500">Resolve exceptions, protect critical work, then release only after planner review.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600">
        <span className="flex items-center gap-1.5"><Clock3 className="size-3.5 text-slate-400" />00:00–04:00</span>
        <span>6 protected sectors</span>
        <span className="text-cyan-700">Simulated planning data</span>
      </div>
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
    toast.success("Response plan prepared for planner review.");
  };

  if (hasReplanned) {
    return (
      <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 text-emerald-700" />
            <div><p className="text-sm font-bold text-emerald-950">Response plan prepared</p><p className="mt-1 text-xs text-emerald-800">{response.schedule.explanation}</p></div>
          </div>
          <div className="flex flex-wrap gap-1.5">{response.impactSummary.slice(1, 4).map((item) => <Badge key={item} variant="success">{item}</Badge>)}</div>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-red-200 bg-red-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 text-red-600" />
          <div><p className="text-sm font-bold text-red-950">{scenario.title}: replan required</p><p className="mt-1 text-xs text-red-700">{scenario.warning} {scenario.affectedRequestIds.length} jobs need review.</p></div>
        </div>
        <Button variant="danger" size="sm" onClick={runReplan} disabled={isReplanning}><Route className="size-3.5" />Replan affected work</Button>
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
  const resetDemo = useRailPlanStore((state) => state.resetDemo);
  const railPlanState = useRailPlanStore();
  const schedule = railPlanState.getVisibleSchedule();
  const status: DashboardStatus = !loaded ? "Draft" : activeDisruptionId && !hasReplanned ? "Disruption detected" : currentView === "original" ? "Conflicts detected" : "Optimised";

  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      <TopNavigation status={status} onReset={resetDemo} loaded={loaded} />
      {!loaded ? <InitialState /> : (
        <main className="mx-auto max-w-[1680px] space-y-5 px-5 py-6 sm:px-6 lg:py-7">
          <div className="flex items-center justify-between gap-3 xl:hidden">
            <p className="text-xs font-semibold text-slate-600">16 Sep 2026 · 00:00–04:00</p>
            <StatusBadge status={status} />
          </div>
          <PlanHeader />
          <StrategyControls />
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Decision signals</h2>
              <p className="mt-1 text-xs text-slate-500">What needs attention before this plan can be reviewed for release.</p>
            </div>
            <MetricsGrid metrics={schedule.metrics} />
          </section>
          <AnimatePresence>{activeDisruptionId && <DisruptionBanner />}</AnimatePresence>
          <div className="grid min-w-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_340px]">
            <RequestQueue />
            <div className="min-w-0"><ScheduleTimeline /></div>
            <div className="min-w-0 xl:col-span-2 2xl:col-span-1"><DetailsPanel /></div>
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 text-xs text-slate-400">
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
