"use client";

import type * as React from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "default" | "quiet" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary:
    "bg-ink-900 text-white border-ink-900 hover:bg-ink-700 hover:border-ink-700 disabled:bg-ink-400 disabled:border-ink-400",
  default:
    "bg-surface text-ink-900 border-rule-strong hover:bg-sunk disabled:text-ink-400 disabled:hover:bg-surface",
  quiet:
    "bg-transparent text-ink-700 border-transparent hover:bg-sunk disabled:text-ink-400 disabled:hover:bg-transparent",
  danger: "bg-signal-red text-white border-signal-red hover:brightness-110 disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1.5",
  md: "h-8 px-3 text-[13px] gap-2",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  ...props
}: React.ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-sm border font-medium transition-colors disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
