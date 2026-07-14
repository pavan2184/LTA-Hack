"use client";

import { motion } from "framer-motion";
import { Check, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const optimisationSteps = ["Checking track availability", "Resolving team conflicts", "Evaluating alternative windows"];

export function LoadingOverlay({ mode, step }: { mode: "optimise" | "replan"; step: number }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <motion.div initial={{ y: 12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-cyan-50 p-2.5 text-cyan-700"><LoaderCircle className="size-5 animate-spin" /></div>
          <div>
            <h2 className="font-bold text-slate-950">{mode === "optimise" ? "Evaluating 22 maintenance requests…" : "Replanning around disruption…"}</h2>
            <p className="text-xs text-slate-500">Applying operational constraints and planner locks.</p>
          </div>
        </div>
        <div className="mt-5 space-y-2.5">
          {(mode === "optimise" ? optimisationSteps : ["Protecting critical work", "Inserting emergency possession", "Validating safety constraints"]).map((label, index) => (
            <div key={label} className="flex items-center gap-2.5 text-sm">
              <span className={cn("flex size-5 items-center justify-center rounded-full", index < step ? "bg-emerald-100 text-emerald-700" : index === step ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-400")}>
                {index < step ? <Check className="size-3" /> : <span className="text-[10px] font-bold">{index + 1}</span>}
              </span>
              <span className={index <= step ? "font-semibold text-slate-800" : "text-slate-400"}>{label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
