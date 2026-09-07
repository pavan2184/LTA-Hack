"use client";

import { useMemo } from "react";
import { disruptionById } from "@railplan/core/data/disruptions";
import { literalWorld } from "@railplan/core/domain/world";
import { useRailPlanStore } from "@/store/useRailPlanStore";
import { visiblePlanningInputs } from "@/store/visible-planning-inputs";
import { GeographicRailMap } from "./GeographicRailMap";

/** Geographic highlighting describes scenario inputs; it defines no exclusion
 * distance, possession boundary, capacity or feasibility rule. */
export function GeographicNetworkView() {
  const result = useRailPlanStore((state) => state.activeResult());
  const activeDisruptionId = useRailPlanStore(
    (state) => state.activeDisruptionId,
  );
  const hasReplanned = useRailPlanStore((state) => state.hasReplanned);
  const selectedRequestId = useRailPlanStore(
    (state) => state.selectedRequestId,
  );
  const selectRequest = useRailPlanStore((state) => state.selectRequest);
  const selectViolation = useRailPlanStore((state) => state.selectViolation);
  const scenario = activeDisruptionId
    ? disruptionById[activeDisruptionId]
    : null;
  const inputs = useMemo(
    () => visiblePlanningInputs(result, scenario, hasReplanned),
    [result, scenario, hasReplanned],
  );
  const affectedBlockIds = useMemo(() => {
    if (!scenario || !inputs) return [];
    const world = inputs.context.world ?? literalWorld();
    if (scenario.blockIds?.length) return scenario.blockIds;
    if (scenario.requestId)
      return (
        (
          inputs.context.extraRequests?.[scenario.requestId] ??
          world.requestById[scenario.requestId]
        )?.blockIds ?? []
      );
    if (scenario.teamId)
      return [
        ...new Set(
          inputs.plan.placements
            .filter((p) => p.teamId === scenario.teamId)
            .flatMap(
              (p) =>
                (
                  inputs.context.extraRequests?.[p.requestId] ??
                  world.requestById[p.requestId]
                )?.blockIds ?? [],
            ),
        ),
      ];
    return scenario.kind === "window-shortened"
      ? world.blocks.map((block) => block.id)
      : [];
  }, [inputs, scenario]);
  return (
    <GeographicRailMap
      plan={inputs?.plan ?? null}
      context={inputs?.context ?? {}}
      selectedRequestId={selectedRequestId}
      affectedBlockIds={affectedBlockIds}
      onSelectRequest={(id) => {
        selectViolation(null);
        selectRequest(id);
      }}
    />
  );
}
