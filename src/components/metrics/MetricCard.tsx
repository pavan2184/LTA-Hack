"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "neutral" | "danger" | "success" | "cyan";
}

export function MetricCard({ label, value, detail, icon: Icon, tone = "neutral" }: MetricCardProps) {
  return (
    <Card role="article" className="min-w-0 rounded-xl border-slate-200/80 p-4 shadow-none transition-colors hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
          <motion.p
            key={value}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-1.5 text-2xl font-black tracking-[-0.03em] text-slate-950"
          >
            {value}
          </motion.p>
          <p className={cn("mt-1 text-xs font-semibold", tone === "danger" ? "text-red-600" : tone === "success" ? "text-emerald-600" : tone === "cyan" ? "text-cyan-700" : "text-slate-500")}>{detail}</p>
        </div>
        <div className={cn("rounded-xl p-2.5", tone === "danger" ? "bg-red-50 text-red-600" : tone === "success" ? "bg-emerald-50 text-emerald-600" : tone === "cyan" ? "bg-cyan-50 text-cyan-700" : "bg-slate-100 text-slate-500")}>
          <Icon className="size-4" />
        </div>
      </div>
    </Card>
  );
}
