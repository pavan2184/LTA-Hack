import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]", {
  variants: {
    variant: {
      neutral: "border-slate-200 bg-slate-50 text-slate-600",
      info: "border-cyan-200 bg-cyan-50 text-cyan-800",
      warning: "border-amber-200 bg-amber-50 text-amber-800",
      danger: "border-red-200 bg-red-50 text-red-700",
      success: "border-emerald-200 bg-emerald-50 text-emerald-700",
      violet: "border-violet-200 bg-violet-50 text-violet-700",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
