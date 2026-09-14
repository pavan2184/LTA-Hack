"use client";

import { useState } from "react";

import { DisruptionDialog } from "@/components/disruption/DisruptionDialog";
import { SandboxPageHeading } from "@/components/sandbox/SandboxPageHeading";
import { Button } from "@/components/ui/button";
import { useRailPlanStore } from "@/store/useRailPlanStore";

export function SandboxScenarios() {
  return (
    <section aria-label="Sandbox scenarios" className="space-y-2.5">
      <SandboxPageHeading
        title="Scenarios"
        description="Apply a disruption to the current plan, measure its impact and solve around the changed conditions."
      />
      <ScenarioTesting />
    </section>
  );
}

/** Quiet disruption controls; impact and replan results render in shared chrome. */
export function ScenarioTesting() {
  const [open, setOpen] = useState(false);
  const activeDisruptionId = useRailPlanStore((state) => state.activeDisruptionId);
  const clearDisruption = useRailPlanStore((state) => state.clearDisruption);
  const stage = useRailPlanStore((state) => state.stage);
  const result = useRailPlanStore((state) => state.activeResult());
  const capacity = result?.metrics.emergencyCapacity;

  return (
    <section className="border border-rule bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <h2 className="text-[12px] font-medium text-ink-900">Scenario testing</h2>
          <p className="text-[11px] leading-relaxed text-ink-500">
            Test whether this schedule can absorb an emergency, a crew going off, or a shortened
            window.
            {capacity
              ? ` ${capacity.numerator} of ${capacity.denominator} emergency scenarios currently fit without displacing mandatory work.`
              : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {activeDisruptionId && (
            <Button size="sm" variant="quiet" onClick={clearDisruption} disabled={stage !== "idle"}>
              Clear scenario
            </Button>
          )}
          <DisruptionDialog
            open={open}
            onOpenChange={setOpen}
            trigger={
              <Button size="sm" variant="quiet" disabled={stage !== "idle"}>
                Test a disruption
              </Button>
            }
          />
        </div>
      </div>
    </section>
  );
}
