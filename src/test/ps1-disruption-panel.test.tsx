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

describe("successive urgent-maintenance constraints", () => {
  it("retains the first cut when adopting a second and invalidates the prior preview after apply", async () => {
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
});
