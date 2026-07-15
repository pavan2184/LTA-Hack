"use client";

import { RefreshCw, Route } from "lucide-react";

import type { DashboardStatus } from "@/components/shared/StatusBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";

interface TopNavigationProps {
  status: DashboardStatus;
  onReset: () => void;
  loaded: boolean;
}

export function TopNavigation({ status, onReset, loaded }: TopNavigationProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1920px] items-center justify-between gap-5 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
            <Route className="size-5 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black tracking-tight text-slate-950">RailPlan</span>
              <span className="hidden text-xs font-semibold text-slate-400 lg:inline">Maintenance planning</span>
            </div>
            <p className="truncate text-xs text-slate-500">North–South · East–West · Circle</p>
          </div>
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-500">Engineering window</p>
            <p className="text-sm font-bold text-slate-800">16 Sep 2026 · 00:00–04:00</p>
          </div>
          <StatusBadge status={status} />
        </div>

        {loaded ? (
          <Button variant="ghost" size="sm" onClick={onReset} title="Reset the sample plan">
            <RefreshCw className="size-3.5" />
            Reset
          </Button>
        ) : <div className="md:hidden"><StatusBadge status={status} /></div>}
      </div>
    </header>
  );
}
