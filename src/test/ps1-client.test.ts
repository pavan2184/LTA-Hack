import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { solveInstance } from "@railplan/ps1/engine/schedule";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { requestPs1Solve } from "@/lib/ps1/client";

const instance = loadInstance(Object.fromEntries(PS1_FILES.map((name) => [
  name, readFileSync(resolve("packages/ps1/data/public", name), "utf8"),
])));
const outcome = solveInstance(instance, { scenario: "A" });
const request = { instance, scenario: "A" as const, pins: [] };

afterEach(() => { vi.unstubAllGlobals(); });

describe("PS1 service response boundary", () => {
  it("sends the complete instance and hard constraints to the same-origin endpoint", async () => {
    const service = vi.fn().mockResolvedValue(Response.json({ outcome }));
    vi.stubGlobal("fetch", service);
    const access = outcome.submission!.access[0];
    const pins = [{ activityId: access.activityId, week: access.week, eclo: access.eclo }];
    const result = await requestPs1Solve({ ...request, pins, disruptions: [] });
    expect(result.status).toBe("FEASIBLE");
    expect(result.validation?.feasible).toBe(true);
    expect(service).toHaveBeenCalledWith("/api/ps1/solve", expect.objectContaining({
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, pins, disruptions: [] }), signal: expect.any(AbortSignal),
    }));
  });

  it("recomputes validation instead of trusting a server's score", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      outcome: { ...outcome, validation: { feasible: true, objectiveScore: -100 } },
    })));
    const result = await requestPs1Solve(request);
    expect(result.validation).toEqual(outcome.validation);
  });

  it("preserves native bound diagnostics without treating a feasible incumbent as proven optimal", async () => {
    const solver = {
      engine: "OR-Tools CP-SAT", status: "UNKNOWN", scope: "full-local-model",
      workers: 8, searchSeconds: 20, bestBound: 0, absoluteGap: outcome.validation!.objectiveScore,
      relativeGap: 1, nativeSolveMs: 20_000, incumbentSource: "heuristic",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      outcome: { ...outcome, diagnostics: { ...outcome.diagnostics, solver } },
    })));
    const result = await requestPs1Solve(request);
    expect(result.status).toBe("FEASIBLE");
    expect(result.diagnostics.solver).toEqual(solver);
  });

  it.each([
    { status: "OPTIMAL", bestBound: 0, absoluteGap: outcome.validation!.objectiveScore, relativeGap: 1 },
    { status: "FEASIBLE", bestBound: 999, absoluteGap: 0, relativeGap: 0 },
    { status: "FEASIBLE", bestBound: 0, absoluteGap: 0, relativeGap: 0 },
  ])("rejects inconsistent native proof metadata", async (proof) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ outcome: {
      ...outcome, diagnostics: { ...outcome.diagnostics, solver: {
        engine: "OR-Tools CP-SAT", scope: "full-local-model", workers: 8, searchSeconds: 20,
        nativeSolveMs: 20_000, incumbentSource: "cp-sat", ...proof,
      } },
    } })));
    await expect(requestPs1Solve(request)).rejects.toThrow("inconsistent proof diagnostics");
  });

  it.each([{}, { outcome: { status: "FEASIBLE" } }, { outcome: { ...outcome, submission: null } }])(
    "rejects a malformed response before displaying a plan", async (body) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
      await expect(requestPs1Solve(request)).rejects.toThrow("invalid response");
    },
  );

  it("rejects a different scenario", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      outcome: { ...outcome, submission: { ...outcome.submission, scenario: "B" } },
    })));
    await expect(requestPs1Solve(request)).rejects.toThrow("different scenario");
  });

  it("rejects an incomplete plan even if the service calls it feasible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      outcome: { ...outcome, submission: { ...outcome.submission, access: [] } },
    })));
    await expect(requestPs1Solve(request)).rejects.toThrow("failed local checks");
  });

  it("rejects a plan that drops a hard pin", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ outcome })));
    await expect(requestPs1Solve({ ...request, pins: [{ activityId: instance.activities[0].activityId, week: 30 }] }))
      .rejects.toThrow("preserve every pin");
  });

  it("revalidates under the requested physical capacity cuts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ outcome })));
    const row = outcome.submission!.occupancy[0];
    await expect(requestPs1Solve({ ...request, disruptions: [{
      locationId: row.locationId, fromWeek: row.week, toWeek: row.week, capacity: 0,
    }] })).rejects.toThrow("failed local checks");
  });

  it("retains infeasible search diagnostics without inventing a schedule", async () => {
    const failure = { status: "INFEASIBLE", diagnostics: { ...outcome.diagnostics, warnings: ["No complete schedule was found in this run."] } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ outcome: failure })));
    expect(await requestPs1Solve(request)).toEqual(failure);
  });

  it("reports service errors without a browser solve fallback", async () => {
    const service = vi.fn().mockResolvedValue(Response.json({ error: { code: "BUSY", message: "Please retry this run." } }, { status: 503 }));
    vi.stubGlobal("fetch", service);
    await expect(requestPs1Solve(request)).rejects.toThrow("Please retry this run.");
    expect(service).toHaveBeenCalledOnce();
  });

  it("does not send an already-aborted request", async () => {
    const service = vi.fn();
    vi.stubGlobal("fetch", service);
    const controller = new AbortController();
    controller.abort();
    await expect(requestPs1Solve(request, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(service).not.toHaveBeenCalled();
  });
});
