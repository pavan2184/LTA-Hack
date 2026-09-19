import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { capacityAt, replanForDisruption, type Disruption } from "@railplan/ps1/engine/disruption";
import { buildNetwork } from "@railplan/ps1/engine/network";
import { solveInstance } from "@railplan/ps1/engine/schedule";
import { buildTimeline } from "@railplan/ps1/engine/timeline";
import { validate } from "@railplan/ps1/engine/validate";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { DisruptionPanel } from "@/components/ps1/DisruptionPanel";
import { mockPs1Service } from "@/test/fixtures/ps1-service";
import type { Ps1SolveRequest } from "@/lib/ps1/client";

const instance = loadInstance(Object.fromEntries(PS1_FILES.map((name) => [
  name, readFileSync(resolve("packages/ps1/data/public", name), "utf8"),
])));
const network = buildNetwork(instance);
const initial = solveInstance(instance, { scenario: "C" }, network).submission!;
const firstLocation = initial.occupancy[0];
const firstCut: Disruption = {
  locationId: firstLocation.locationId,
  fromWeek: firstLocation.week,
  toWeek: firstLocation.week,
  capacity: Math.max(0, network.supply.get(firstLocation.locationId)!.supplyCapacity - 1),
};
const existingDisruptions = [firstCut];
const applied = replanForDisruption(instance, initial, existingDisruptions, network).submission;
const timeline = buildTimeline(instance, applied, network, existingDisruptions);
const secondCell = timeline.rows.flatMap((row) => [...row.cells.values()].map((cell) => ({ row, cell })))
  .find(({ row, cell }) => row.locationId !== firstCut.locationId && cell.possessions > Math.max(0, cell.effectiveCapacity - 1))!;
const secondTarget = { locationId: secondCell.row.locationId, week: secondCell.cell.week };

beforeEach(() => { vi.stubGlobal("fetch", mockPs1Service()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("successive urgent-maintenance constraints", () => {
  it("retains the first cut when adopting a second and invalidates the prior preview after apply", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const props = { instance, submission: applied, network, existingDisruptions, target: secondTarget, open: true, onOpenChange: vi.fn(), onApply };
    const { rerender } = render(<DisruptionPanel {...props} />);
    await user.click(screen.getByRole("button", { name: "Re-plan around it" }));
    await user.click(await screen.findByRole("button", { name: "Adopt this schedule" }));

    expect(onApply).toHaveBeenCalledOnce();
    const [outcome, cuts] = onApply.mock.calls[0];
    expect(cuts).toEqual([firstCut, {
      locationId: secondTarget.locationId,
      fromWeek: secondTarget.week,
      toWeek: secondTarget.week,
      capacity: Math.max(0, secondCell.cell.effectiveCapacity - 1),
    }]);
    expect(validate(instance, outcome.submission, network, cuts).feasible).toBe(true);
    expect(capacityAt(network, cuts, firstCut.locationId, firstCut.fromWeek)).toBe(firstCut.capacity);
    expect(capacityAt(network, [...cuts, firstCut], firstCut.locationId, firstCut.fromWeek)).toBe(firstCut.capacity);

    rerender(<DisruptionPanel {...props} submission={outcome.submission} existingDisruptions={cuts} />);
    expect(screen.queryByRole("button", { name: "Adopt this schedule" })).not.toBeInTheDocument();
  });

  it("starts an overlapping cut from already reduced capacity", () => {
    render(<DisruptionPanel instance={instance} submission={applied} network={network}
      existingDisruptions={existingDisruptions} target={{ locationId: firstCut.locationId, week: firstCut.fromWeek }}
      open onOpenChange={vi.fn()} onApply={vi.fn()} />);
    expect(screen.getByRole("spinbutton", { name: /Reduced to/ })).toHaveValue(Math.max(0, firstCut.capacity - 1));
  });

  it("sends explicit planner pins and cumulative cuts to the service", async () => {
    const service = vi.mocked(fetch);
    const access = applied.access[0];
    const pin = { activityId: access.activityId, week: access.week, eclo: access.eclo };
    const pins = [pin];
    render(<DisruptionPanel instance={instance} submission={applied} network={network}
      pins={pins} existingDisruptions={existingDisruptions} target={secondTarget}
      open onOpenChange={vi.fn()} onApply={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Re-plan around it" }));
    const request = JSON.parse(String(service.mock.calls[0][1]?.body)) as Ps1SolveRequest;
    expect(service.mock.calls[0][0]).toBe("/api/ps1/solve");
    expect(request.pins).toContainEqual(pin);
    expect(request.pins.length).toBeGreaterThan(1);
    expect(request.disruptions).toHaveLength(2);
    expect(request.disruptions![0]).toEqual(firstCut);
  });

  it("releases transitive successors from automatic holds while retaining explicit pins", async () => {
    const location = instance.locationSupply.find((entry) => entry.locationKind === "tunnel sector")!;
    const otherLocation = instance.locationSupply.find((entry) => entry.locationKind === "tunnel sector" && entry.lineCode !== location.lineCode)!;
    const contract = { ...instance.contracts[0], natureOfActivity: "Non-live (Others)" as const, accessType: "PM" as const, numberOfMaximumAccessPerWeek: 3, numberOfWorkfronts: 1 };
    const chainInstance = {
      ...instance,
      contracts: [contract],
      locationSupply: instance.locationSupply.map((entry) => entry.locationId === location.locationId ? { ...entry, supplyCapacity: 1 } : entry),
      activities: ["ROOT", "CHILD", "GRANDCHILD", "OTHER"].map((activityId, index) => ({
        ...instance.activities[0], activityId, contractNumber: contract.contractNumber,
        plannedStartDate: instance.parameters.horizonStart, totalAccesses: 1,
        predecessorActivityId: index === 1 ? "ROOT" : index === 2 ? "CHILD" : null,
        startLocationId: index === 3 ? otherLocation.locationId : location.locationId,
        endLocationId: index === 3 ? otherLocation.locationId : location.locationId,
      })),
    };
    const basis = solveInstance(chainInstance, { scenario: "A" }).submission!;
    const root = basis.access.find((row) => row.activityId === "ROOT")!;
    const child = basis.access.find((row) => row.activityId === "CHILD")!;
    const pin = { activityId: child.activityId, week: child.week, eclo: child.eclo };
    const service = vi.fn().mockResolvedValue(Response.json({ outcome: {
      status: "INFEASIBLE", diagnostics: { startsTried: 1, candidatesEvaluated: 1, elapsedMs: 1, warnings: ["The explicit child pin blocks this cut."], rejectedPins: [] },
    } }));
    vi.stubGlobal("fetch", service);
    render(<DisruptionPanel instance={chainInstance} submission={basis} network={buildNetwork(chainInstance)}
      pins={[pin]} target={{ locationId: location.locationId, week: root.week }}
      open onOpenChange={vi.fn()} onApply={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Re-plan around it" }));
    const request = JSON.parse(String(service.mock.calls[0][1]?.body)) as Ps1SolveRequest;
    expect(request.pins).toContainEqual(pin);
    expect(request.pins.some((entry) => entry.activityId === "OTHER")).toBe(true);
    expect(request.pins.some((entry) => entry.activityId === "ROOT")).toBe(false);
    expect(request.pins.some((entry) => entry.activityId === "GRANDCHILD")).toBe(false);
    expect(await screen.findByRole("alert")).toHaveTextContent("explicit child pin blocks");
    expect(screen.queryByRole("button", { name: "Adopt this schedule" })).not.toBeInTheDocument();
  });

  it("reports service failure without offering adoption or changing the current schedule", async () => {
    const onApply = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "BUSY", message: "Scheduling is busy; try again." } }, { status: 503 })));
    render(<DisruptionPanel instance={instance} submission={applied} network={network}
      existingDisruptions={existingDisruptions} target={secondTarget}
      open onOpenChange={vi.fn()} onApply={onApply} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Re-plan around it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Scheduling is busy");
    expect(screen.queryByRole("button", { name: "Adopt this schedule" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-plan around it" })).toBeEnabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("aborts a pending replan when the cut changes and ignores its late result", async () => {
    let complete!: (response: Response) => void;
    let signal!: AbortSignal;
    vi.stubGlobal("fetch", vi.fn((_url: RequestInfo | URL, options?: RequestInit) => {
      signal = options!.signal!;
      return new Promise<Response>((resolveResponse) => { complete = resolveResponse; });
    }));
    render(<DisruptionPanel instance={instance} submission={applied} network={network}
      existingDisruptions={existingDisruptions} target={secondTarget}
      open onOpenChange={vi.fn()} onApply={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Re-plan around it" }));
    expect(screen.getByRole("status")).toHaveTextContent("Replanning on the server");
    await user.clear(screen.getByRole("spinbutton", { name: /Reduced to/ }));
    expect(signal.aborted).toBe(true);
    await act(async () => complete(Response.json({ outcome: {} })));
    expect(screen.queryByRole("button", { name: "Adopt this schedule" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
