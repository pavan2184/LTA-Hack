/// <reference lib="webworker" />

import { solveInstance, type Pin } from "@railplan/ps1/engine/schedule";
import type { Disruption } from "@railplan/ps1/engine/disruption";
import type { Ps1Instance, Scenario, SolveOutcome } from "@railplan/ps1/types/ps1";

export interface Ps1WorkerRequest {
  id: number;
  instance: Ps1Instance;
  scenarios: Scenario[];
  pins: Pin[];
  disruptions?: Partial<Record<Scenario, Disruption[]>>;
}

export type Ps1WorkerResponse =
  | { id: number; type: "progress"; scenario: Scenario; completed: number; total: number }
  | { id: number; type: "complete"; outcomes: SolveOutcome[] }
  | { id: number; type: "error"; message: string };

self.onmessage = (event: MessageEvent<Ps1WorkerRequest>) => {
  const request = event.data;
  try {
    const outcomes: SolveOutcome[] = [];
    request.scenarios.forEach((scenario, index) => {
      outcomes.push(
        solveInstance(request.instance, {
          scenario,
          pins: request.pins,
          disruptions: request.disruptions?.[scenario] ?? [],
          initialCandidates: outcomes.flatMap((outcome) =>
            outcome.status === "FEASIBLE" && outcome.submission ? [outcome.submission] : []),
        }),
      );
      self.postMessage({
        id: request.id,
        type: "progress",
        scenario,
        completed: index + 1,
        total: request.scenarios.length,
      } satisfies Ps1WorkerResponse);
    });
    self.postMessage({ id: request.id, type: "complete", outcomes } satisfies Ps1WorkerResponse);
  } catch (cause) {
    self.postMessage({
      id: request.id,
      type: "error",
      message: cause instanceof Error ? cause.message : String(cause),
    } satisfies Ps1WorkerResponse);
  }
};

export {};
