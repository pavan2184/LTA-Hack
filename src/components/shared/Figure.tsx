"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The shape a figure needs, rather than one product's metric type.
 *
 * RailPlan measures a night in minutes and PS1 measures a horizon in weeks, so
 * their metric types name different units — but "a number that can show its own
 * arithmetic" is the same idea in both, and it should be the same control. Both
 * `MetricValue` and PS1's `Metric` satisfy this structurally.
 */
export interface FigureMetric {
  /** Unused here, but both metric types carry it and call sites pass literals. */
  key?: string;
  label: string;
  value: number;
  unit: string;
  numerator: number;
  denominator: number;
  formula: string;
  note: string;
}

/**
 * Only units the label does not already carry. "ECLO nights" followed by
 * "0 nights" says nothing twice; a bare percent sign says something once.
 */
function suffix(unit: string): string {
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
  metric: FigureMetric;
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
