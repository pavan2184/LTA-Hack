"use client";

import { Download, RefreshCw, Route } from "lucide-react";
import { toast } from "sonner";

import type { DashboardStatus } from "@/components/shared/StatusBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";

interface TopNavigationProps {
  status: DashboardStatus;
  onLoadDemo: () => void;
  onReset: () => void;
  loaded: boolean;
}

export function TopNavigation({ status, onLoadDemo, onReset, loaded }: TopNavigationProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[68px] max-w-[1920px] items-center justify-between gap-5 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
            <Route className="size-5 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black tracking-tight text-slate-950">RailPlan</span>
              <span className="hidden text-xs font-semibold text-slate-400 lg:inline">Rail Maintenance Control Centre</span>
            </div>
            <p className="truncate text-xs text-slate-500">North–South, East–West & Circle Lines</p>
          </div>
        </div>

        <div className="hidden items-center gap-5 xl:flex">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Planning period</p>
            <p className="text-sm font-semibold text-slate-800">16–20 September 2026</p>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="flex items-center gap-2">
          {loaded && (
            <Button variant="ghost" size="sm" onClick={onReset} title="Reset the schedule">
              <RefreshCw className="size-3.5" />
              <span className="hidden xl:inline">Reset</span>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onLoadDemo}>Load Demo</Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => toast.success("Schedule export prepared successfully.")}
          >
            <Download className="size-3.5" />
            <span className="hidden md:inline">Export Schedule</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
