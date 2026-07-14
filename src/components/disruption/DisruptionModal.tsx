"use client";

import { Clock3, Construction, HardHat, Siren, TimerReset } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { disruptionScenarios } from "@/data/disruptionScenarios";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";

const icons = { track: Construction, team: HardHat, overrun: TimerReset, window: Clock3 };

export function DisruptionModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [selected, setSelected] = useState("track-fault");
  const triggerDisruption = useRailPlanStore((state) => state.triggerDisruption);

  const apply = () => {
    triggerDisruption(selected);
    onOpenChange(false);
    toast.warning("Disruption detected. Replanning is required.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-red-50 p-2.5 text-red-600"><Siren className="size-5" /></div>
          <div>
            <DialogTitle>Simulate operational disruption</DialogTitle>
            <DialogDescription>Choose a deterministic scenario to test schedule resilience.</DialogDescription>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {disruptionScenarios.map((scenario) => {
            const Icon = icons[scenario.icon];
            const active = selected === scenario.id;
            return (
              <button
                type="button"
                key={scenario.id}
                onClick={() => setSelected(scenario.id)}
                className={cn("rounded-xl border p-3 text-left transition", active ? "border-red-300 bg-red-50 ring-2 ring-red-100" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50")}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className={cn("mt-0.5 size-4", active ? "text-red-600" : "text-slate-400")} />
                  <div>
                    <p className="text-sm font-bold text-slate-900">{scenario.title}</p>
                    <p className="mt-1 text-xs leading-4 text-slate-500">{scenario.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="danger" onClick={apply}><Siren className="size-4" />Apply disruption</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
