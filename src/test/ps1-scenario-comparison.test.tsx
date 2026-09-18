import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { buildNetwork } from "@railplan/ps1/engine/network";
import { solveInstance } from "@railplan/ps1/engine/schedule";
import { loadInstance, PS1_FILES } from "@railplan/ps1/io/load";
import { ScenarioComparison } from "@/components/ps1/Ps1Workbench";
import type { ScenarioRun } from "@/components/ps1/workspace-types";

const instance = loadInstance(Object.fromEntries(
  PS1_FILES.map((name) => [name, readFileSync(resolve("packages/ps1/data/public", name), "utf8")]),
));
const network = buildNetwork(instance);

describe("scenario comparison", () => {
  it("keeps infeasible and invalid outcomes beside a feasible policy", async () => {
    const runs: ScenarioRun[] = [
      { scenario: "A", outcome: solveInstance(instance, { scenario: "A" }, network), network, disruptions: [] },
      { scenario: "B", outcome: { status: "INFEASIBLE", diagnostics: { startsTried: 24, candidatesEvaluated: 2500, elapsedMs: 12, warnings: ["Pinned work cannot fit."], rejectedPins: [] } }, network, disruptions: [] },
      { scenario: "C", outcome: { status: "INVALID_INSTANCE", diagnostics: { startsTried: 0, candidatesEvaluated: 0, elapsedMs: 1, warnings: ["Predecessor cycle."], rejectedPins: [] } }, network, disruptions: [] },
    ];
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ScenarioComparison runs={runs} active="A" onSelect={onSelect} diff={null} />);

    expect(screen.getByRole("tab", { name: /Policy A/ })).toHaveTextContent("FEASIBLE");
    expect(screen.getByRole("tab", { name: /Policy B/ })).toHaveTextContent("Pinned work cannot fit");
    expect(screen.getByRole("tab", { name: /Policy C/ })).toHaveTextContent("Predecessor cycle");
    await user.click(screen.getByRole("tab", { name: /Policy B/ }));
    expect(onSelect).toHaveBeenCalledWith("B");
  });
});
