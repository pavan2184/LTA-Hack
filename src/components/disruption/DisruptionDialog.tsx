"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { disruptionScenarios } from "@railplan/core/data/disruptions";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";

export function DisruptionDialog({
  open,
  onOpenChange,
  trigger,
}: {
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState(disruptionScenarios[0].id);
  const triggerDisruption = useRailPlanStore((state) => state.triggerDisruption);

  const apply = () => {
    triggerDisruption(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>Test a disruption</DialogTitle>
        <DialogDescription>
          Each scenario changes the inputs the solver sees. The plan is checked against the new
          situation first, so you see what breaks before anything is rescheduled.
        </DialogDescription>

        <div className="mt-4 space-y-1.5">
          {disruptionScenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => setSelected(scenario.id)}
              aria-pressed={selected === scenario.id}
              className={cn(
                "block w-full border px-3 py-2 text-left transition-colors",
                selected === scenario.id
                  ? "border-accent bg-accent-soft"
                  : "border-rule hover:border-rule-strong hover:bg-sunk",
              )}
            >
              <p className="text-[13px] font-medium text-ink-900">{scenario.title}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-ink-500">{scenario.description}</p>
              <p className="mt-1 font-mono text-[11px] text-ink-400">
                changes: {describeChange(scenario.kind)}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-1.5">
          <Button size="sm" variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={apply}>
            Apply to this plan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function describeChange(kind: string): string {
  switch (kind) {
    case "block-closure":
      return "adds a mandatory emergency job pinned to 02:00-03:00";
    case "team-unavailable":
      return "sets a crew unavailable from a given time";
    case "overrun":
      return "extends one job's duration and pins its start";
    case "window-shortened":
      return "moves the handback deadline earlier";
    default:
      return kind;
  }
}
