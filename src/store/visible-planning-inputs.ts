import { buildDisruptionInputs } from "@railplan/core/data/disruptions";
import type {
  DisruptionScenario,
  Plan,
  SolveResult,
} from "@railplan/core/types/railplan";
import type { ValidationContext } from "@railplan/core/engine/validate";

/** One input boundary for pending-disruption validation and visualizations.
 * Solved results already contain forced placements, including longer overruns. */
export function visiblePlanningInputs(
  result: SolveResult | null,
  scenario: DisruptionScenario | null,
  alreadyPlanned: boolean,
): { plan: Plan; context: ValidationContext } | null {
  if (!result) return null;
  if (!scenario) return { plan: result.plan, context: {} };
  const inputs = buildDisruptionInputs(scenario, result.plan.placements);
  if (alreadyPlanned) return { plan: result.plan, context: inputs.context };
  const changed = new Map(
    inputs.locked.map((placement) => [placement.requestId, placement]),
  );
  return {
    plan: {
      placements: [
        ...result.plan.placements.map(
          (placement) => changed.get(placement.requestId) ?? placement,
        ),
        ...inputs.locked.filter(
          (placement) =>
            !result.plan.placements.some(
              (item) => item.requestId === placement.requestId,
            ),
        ),
      ],
      deferred: result.plan.deferred,
    },
    context: inputs.context,
  };
}
