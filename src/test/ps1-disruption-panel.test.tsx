import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { capacityAt, replanForDisruption, type Disruption } from "@railplan/ps1/engine/disruption";
import { buildNetwork } from "@railplan/ps1/engine/network";
import { solveInstance } from "@railplan/ps1/engine/schedule";
import { buildTimeline } from "@railplan/ps1/engine/timeline";
import { validate } from "@railplan/ps1/engine/validate";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { DisruptionPanel } from "@/components/ps1/DisruptionPanel";

const instance = loadInstance(Object.fromEntries(PS1_FILES.map((name) => [
  name, readFileSync(resolve("packages/ps1/data/public", name), "utf8"),
])));
const network = buildNetwork(instance);
const initial = solveInstance(instance, { scenario: "C" }, network).submission!;
// A028 has room to move without releasing a successor's hard pin. The first
// output row is not a stable fixture: an improved schedule can put a tightly
// constrained predecessor there, making the supposed applied setup invalid.
const firstLocation = initial.occupancy.find((row) =>
  row.activityId === "A028" && row.locationId === "PLAT:ALP:S03:EB" && row.week === 9)!;
const firstCut: Disruption = {
  locationId: firstLocation.locationId,
  fromWeek: firstLocation.week,
  toWeek: firstLocation.week,
  capacity: Math.max(0, network.supply.get(firstLocation.locationId)!.supplyCapacity - 1),
};
const existingDisruptions = [firstCut];
const firstOutcome = replanForDisruption(instance, initial, existingDisruptions, network);
const applied = firstOutcome.submission;
const timeline = buildTimeline(instance, applied, network, existingDisruptions);
const secondCell = timeline.rows.flatMap((row) => [...row.cells.values()].map((cell) => ({ row, cell })))
  .find(({ row, cell }) => row.locationId !== firstCut.locationId && cell.possessions > Math.max(0, cell.effectiveCapacity - 1))!;
const secondTarget = { locationId: secondCell.row.locationId, week: secondCell.cell.week };

describe("successive urgent-maintenance constraints", () => {
  it("retains the first cut when adopting a second and invalidates the prior preview after apply", async () => {
    expect(firstOutcome.impact.displaced.length).toBeGreaterThan(0);
    expect(validate(instance, applied, network, existingDisruptions).feasible).toBe(true);
    const firstDisplaced = new Set(firstOutcome.impact.displaced.map((row) => `${row.activityId}|${row.week}`));
    for (const row of initial.access.filter((entry) => !firstDisplaced.has(`${entry.activityId}|${entry.week}`))) {
      expect(applied.access).toContainEqual(expect.objectContaining({
        activityId: row.activityId, week: row.week, eclo: row.eclo,
      }));
    }
    const user = userEvent.setup();
    const onApply = vi.fn();
    const props = { instance, submission: applied, network, existingDisruptions, target: secondTarget, open: true, onOpenChange: vi.fn(), onApply };
    const { rerender } = render(<DisruptionPanel {...props} />);
    await user.click(screen.getByRole("button", { name: "Re-plan around it" }));
    await user.click(screen.getByRole("button", { name: "Adopt this schedule" }));

    expect(onApply).toHaveBeenCalledOnce();
    const [outcome, cuts] = onApply.mock.calls[0];
    expect(cuts).toEqual([firstCut, {
      locationId: secondTarget.locationId,
      fromWeek: secondTarget.week,
      toWeek: secondTarget.week,
      capacity: Math.max(0, secondCell.cell.effectiveCapacity - 1),
    }]);
    expect(outcome.impact.displaced.length).toBeGreaterThan(0);
    expect(validate(instance, outcome.submission, network, cuts).feasible).toBe(true);
    const displaced = new Set(outcome.impact.displaced.map((row: { activityId: string; week: number }) => `${row.activityId}|${row.week}`));
    for (const row of applied.access.filter((entry) => !displaced.has(`${entry.activityId}|${entry.week}`))) {
      expect(outcome.submission.access).toContainEqual(expect.objectContaining({
        activityId: row.activityId, week: row.week, eclo: row.eclo,
      }));
    }
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

  it("blocks adoption when a capacity cut cannot preserve a successor's hard pin", async () => {
    // A003 needs five standard accesses in weeks 11–15. Cutting week 15
    // leaves no replacement before A004's pinned first access in week 16.
    const blockedCut: Disruption = {
      locationId: "PLAT:BET:H01:EB", fromWeek: 15, toWeek: 15, capacity: 0,
    };
    expect(initial.access.filter((row) => row.activityId === "A003").map((row) => [row.week, row.eclo]))
      .toEqual([[11, 0], [12, 0], [13, 0], [14, 0], [15, 0]]);
    expect(initial.access).toContainEqual(expect.objectContaining({ activityId: "A004", week: 16, eclo: 0 }));
    const blocked = replanForDisruption(instance, initial, [blockedCut], network);
    expect(validate(instance, blocked.submission, network, [blockedCut]).hardViolations)
      .toContainEqual(expect.objectContaining({ rule: "predecessor" }));

    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<DisruptionPanel instance={instance} submission={initial} network={network}
      target={{ locationId: blockedCut.locationId, week: blockedCut.fromWeek }}
      open onOpenChange={vi.fn()} onApply={onApply} />);
    expect(screen.getByRole("spinbutton", { name: /Reduced to/ })).toHaveValue(0);
    await user.click(screen.getByRole("button", { name: "Re-plan around it" }));
    const adopt = screen.getByRole("button", { name: "Adopt this schedule" });
    expect(adopt).toBeDisabled();
    await user.click(adopt);
    expect(onApply).not.toHaveBeenCalled();
  });
});
