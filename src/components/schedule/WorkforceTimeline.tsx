"use client";

import { useMemo } from "react";
import { disruptionById } from "@railplan/core/data/disruptions";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import { visiblePlanningInputs } from "@/store/visible-planning-inputs";
import { WorkforceChart } from "./WorkforceChart";

export function WorkforceTimeline() {
  const result = useRailPlanStore((state) => state.activeResult());
  const activeDisruptionId = useRailPlanStore(
    (state) => state.activeDisruptionId,
  );
  const hasReplanned = useRailPlanStore((state) => state.hasReplanned);
  const stage = useRailPlanStore((state) => state.stage);
  const selectedRequestId = useRailPlanStore(
    (state) => state.selectedRequestId,
  );
  const selectRequest = useRailPlanStore((state) => state.selectRequest);
  const selectViolation = useRailPlanStore((state) => state.selectViolation);
  const workforceView = useRailPlanStore((state) => state.workforceView);
  const setWorkforceView = useRailPlanStore((state) => state.setWorkforceView);
  const inputs = useMemo(
    () =>
      visiblePlanningInputs(
        result,
        activeDisruptionId ? disruptionById[activeDisruptionId] : null,
        hasReplanned,
      ),
    [result, activeDisruptionId, hasReplanned],
  );

  return (
    <WorkforceChart
      plan={inputs?.plan ?? null}
      context={inputs?.context ?? {}}
      loading={stage !== "idle"}
      stale={!!activeDisruptionId && !hasReplanned}
      infeasible={result?.status === "INFEASIBLE"}
      selectedRequestId={selectedRequestId}
      viewState={workforceView}
      onViewStateChange={setWorkforceView}
      onSelectRequest={(id) => {
        selectViolation(null);
        selectRequest(id);
      }}
    />
  );
}
