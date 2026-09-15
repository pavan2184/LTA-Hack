"use client";

import { useMemo, type ReactNode } from "react";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { disruptionById } from "@railplan/core/data/disruptions";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import { visiblePlanningInputs } from "@/store/visible-planning-inputs";
import { PlannerQueue } from "@/components/plans/PlannerQueue";
import { SandboxTimeline } from "./SandboxTimeline";

const demoFacts = buildInstanceFromLiterals();

/** Adapt only fabricated, currently visible inputs; never fetch saved plans. */
export function SandboxPlannerPanel({ kind, headerActions }: { kind: "queue" | "timeline"; headerActions?: ReactNode }) {
  const result = useRailPlanStore((state) => state.activeResult());
  const scenarioId = useRailPlanStore((state) => state.activeDisruptionId);
  const hasReplanned = useRailPlanStore((state) => state.hasReplanned);
  const disruptionImpact = useRailPlanStore((state) => state.disruptionImpact);
  const selectedRequestId = useRailPlanStore((state) => state.selectedRequestId);
  const selectedViolationId = useRailPlanStore((state) => state.selectedViolationId);
  const selectRequest = useRailPlanStore((state) => state.selectRequest);
  const inputs = useMemo(() => visiblePlanningInputs(result, scenarioId ? disruptionById[scenarioId] : null, hasReplanned), [result, scenarioId, hasReplanned]);
  if (!inputs || !result) return null;
  const facts = {
    ...demoFacts,
    window: { ...demoFacts.window, endMinute: inputs.context.windowEnd ?? demoFacts.window.endMinute },
    requests: [...demoFacts.requests, ...Object.values(inputs.context.extraRequests ?? {})],
  };
  const violations = scenarioId && !hasReplanned ? disruptionImpact : result.violations;
  const props = { facts, plan: inputs.plan, selectedRequestId, onSelectRequest: selectRequest, violations };
  return kind === "queue"
    ? <PlannerQueue {...props} label="Demo request queue" heading={false} additionalFilters />
    : <SandboxTimeline {...props} label="Demo block Gantt" headerActions={headerActions} selectedViolationId={selectedViolationId} closedBlockIds={inputs.context.closedBlockIds} />;
}
