import type { Disruption } from "@railplan/ps1/engine/disruption";
import type { Network } from "@railplan/ps1/engine/network";
import type { Scenario, SolveOutcome, Submission, ValidationReport } from "@railplan/ps1/types/ps1";

export type WorkspaceSelection =
  | { kind: "activity"; activityId: string }
  | { kind: "location-week"; locationId: string; week: number }
  | null;

export interface ScenarioRun {
  scenario: Scenario;
  outcome: SolveOutcome;
  network: Network;
  disruptions: Disruption[];
}

export interface ReadyScenarioRun extends ScenarioRun {
  outcome: SolveOutcome & {
    status: "FEASIBLE";
    submission: Submission;
    validation: ValidationReport;
  };
}

export function isReadyScenario(run: ScenarioRun | null | undefined): run is ReadyScenarioRun {
  return Boolean(
    run &&
      run.outcome.status === "FEASIBLE" &&
      run.outcome.submission &&
      run.outcome.validation,
  );
}
