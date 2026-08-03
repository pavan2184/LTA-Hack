"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { MetricValue } from "@/types/railplan";

function suffix(unit: MetricValue["unit"]): string {
  if (unit === "percent") return "%";
  if (unit === "minutes") return " min";
  return "";
}

/**
 * A computed number, with its arithmetic attached.
 *
 * Every figure on this dashboard can be opened to show its formula, numerator
 * and denominator. That is the difference between a KPI and a claim: a planner
 * who disagrees with a number can see exactly what produced it.
 */
export function Figure({
  metric,
  secondary,
  tone = "neutral",
  className,
}: {
  metric: MetricValue;
  secondary?: string;
  tone?: "neutral" | "red" | "amber" | "green";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const toneClass =
    tone === "red"
      ? "text-signal-red"
      : tone === "amber"
        ? "text-signal-amber"
        : tone === "green"
          ? "text-signal-green"
          : "text-ink-900";

  return (
    <div className={cn("relative border border-rule bg-surface px-3 py-2.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-[0.06em] text-ink-500">{metric.label}</span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`Show how ${metric.label} is calculated`}
          className="rounded-xs border border-rule px-1 text-[10px] font-medium text-ink-400 hover:border-rule-strong hover:text-ink-700"
        >
          fx
        </button>
      </div>

      <p className={cn("mt-1 text-[22px] font-semibold leading-none", toneClass)}>
        {metric.value}
        <span className="text-[13px] font-medium">{suffix(metric.unit)}</span>
      </p>

      {secondary && <p className="mt-1.5 text-[12px] text-ink-500">{secondary}</p>}

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-rule-strong bg-surface p-3 text-[12px] leading-relaxed text-ink-700">
          <p className="font-mono text-[11px] text-ink-900">{metric.formula}</p>
          <p className="mt-1.5 text-ink-500">
            {metric.numerator} / {metric.denominator}
          </p>
          <p className="mt-1.5">{metric.note}</p>
        </div>
      )}
    </div>
  );
}
