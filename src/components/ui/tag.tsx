import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "red" | "amber" | "green" | "accent";

const tones: Record<Tone, string> = {
  neutral: "border-rule text-ink-500 bg-sunk",
  red: "border-signal-red/35 text-signal-red bg-signal-red-soft",
  amber: "border-signal-amber/35 text-signal-amber bg-signal-amber-soft",
  green: "border-signal-green/35 text-signal-green bg-signal-green-soft",
  accent: "border-accent/30 text-accent bg-accent-soft",
};

/**
 * A small status label. Used sparingly: a tag on every row is decoration, and
 * decoration is what makes a real state hard to spot.
 */
export function Tag({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-xs border px-1.5 py-px text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
