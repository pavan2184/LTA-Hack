import { vi } from "vitest";
import { solveInstance } from "@railplan/ps1/engine/schedule";
import type { SolveOutcome } from "@railplan/ps1/types/ps1";
import type { Ps1SolveRequest } from "@/lib/ps1/client";

const fixtures = new Map<string, SolveOutcome>();

/** UI tests exercise transport and review state; native modelling has its own tests. */
export function mockPs1Service() {
  return vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    const key = String(options?.body);
    const request = JSON.parse(key) as Ps1SolveRequest;
    let outcome = fixtures.get(key);
    if (!outcome) {
      outcome = solveInstance(request.instance, {
        scenario: request.scenario, pins: request.pins, disruptions: request.disruptions,
      });
      fixtures.set(key, outcome);
    }
    return Response.json({ outcome });
  });
}
