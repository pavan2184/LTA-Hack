import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PS1_FILES } from "@railplan/ps1/io/load";
import { SUBMISSION_FILES } from "@railplan/ps1/io/submission";
import { Ps1Workbench } from "@/components/ps1/Ps1Workbench";

const publicInstance = Object.fromEntries(
  PS1_FILES.map((name) => [name, readFileSync(resolve("packages/ps1/data/public", name), "utf8")]),
);
const referenceSubmission = Object.fromEntries(
  SUBMISSION_FILES.map((name) => [name, readFileSync(resolve("packages/ps1/data/sample-submission", name), "utf8")]),
);

function renderWorkbench() {
  return render(<Ps1Workbench publicInstance={publicInstance} referenceSubmission={referenceSubmission} />);
}

async function solve(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Load the public instance and run/ }));
  await screen.findByRole("tab", { name: /Policy C/ });
}

function timeline() {
  return screen.getByRole("grid", { name: /Possessions per location per week/ });
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("workspace state and policy comparison", () => {
  it("starts with a private preflight and one-click public run", () => {
    renderWorkbench();
    expect(screen.getByRole("heading", { name: /Load, validate and optimise/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Load the public instance and run/ })).toBeEnabled();
    expect(screen.getByText(/stay on this device/)).toBeInTheDocument();
  });

  it("opens policy C after a fresh solve and shows all policy outcomes", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    expect(screen.getAllByRole("tab", { name: /Policy [ABC]/ })).toHaveLength(3);
    expect(screen.getByRole("tab", { name: /Policy C/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Policy A/ })).toHaveTextContent("25.2");
    expect(screen.queryByText(/best scenario/i)).not.toBeInTheDocument();
  });

  it("supports arrow-key navigation across policy cards", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    const current = screen.getByRole("tab", { name: /Policy C/ });
    current.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Policy A/ })).toHaveAttribute("aria-selected", "true");
  });

  it("preserves the active policy when the current instance is re-run", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    await user.click(screen.getByRole("tab", { name: /Policy A/ }));
    await user.click(screen.getByRole("button", { name: "Re-run" }));
    expect(await screen.findByRole("tab", { name: /Policy A/ })).toHaveAttribute("aria-selected", "true");
  });
});

describe("instance loading", () => {
  it("names ignored files and missing official files", async () => {
    const user = userEvent.setup();
    const { container } = renderWorkbench();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [
      new File(["x"], "01_LINES.csv", { type: "text/csv" }),
      new File(["x"], "notes.csv", { type: "text/csv" }),
    ]);
    expect((await screen.findByText(/Ignored 1 file/)).closest("p")).toHaveTextContent("notes.csv");
    expect(screen.getByText("Missing 02_STATIONS.csv")).toBeInTheDocument();
  });
});

describe("linked timeline and inspector", () => {
  it("uses a single focusable ARIA grid and arrow keys update the selected cell", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    const grid = timeline();
    expect(grid).toHaveAttribute("tabindex", "0");
    expect(within(grid).queryAllByRole("button")).toHaveLength(0);
    const before = grid.getAttribute("aria-activedescendant");
    grid.focus();
    await user.keyboard("{ArrowRight}");
    expect(grid.getAttribute("aria-activedescendant")).not.toBe(before);
    expect(screen.getAllByText(/wk2$/).length).toBeGreaterThan(0);
  });

  it("selects a location-week and seeds urgent maintenance from it", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    const cell = within(timeline()).getAllByRole("gridcell", { name: /week \d+, \d+ of \d+ possessions/ })[0];
    const label = cell.getAttribute("aria-label")!;
    const place = label.slice(0, label.indexOf(" week "));
    await user.click(cell);
    await user.click(screen.getAllByRole("button", { name: /Impose urgent maintenance here/ })[0]);
    const picker = screen.getByRole("combobox", { name: /Location/ });
    expect(within(picker).getByRole("option", { selected: true })).toHaveTextContent(place);
  });

  it("filters locations and recovers from an empty result", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    await user.type(screen.getByRole("searchbox", { name: /Find a location/ }), "ZZZZ");
    expect(screen.getByText(/No location matches/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Clear filters/ }));
    expect(within(timeline()).getAllByRole("rowheader").length).toBeGreaterThan(0);
  });
});

describe("proof, conformance and export", () => {
  it("keeps validation and the exact official manifest in the proof drawer", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    await user.click(screen.getByRole("button", { name: /Proof and export/ }));
    expect(screen.getByRole("dialog", { name: /Proof, handover and export/ })).toBeInTheDocument();
    expect(screen.getAllByText(/cross-possession physical-night alignment/).length).toBeGreaterThan(0);
    expect(screen.getByText(/A\/, B\/ and C\//)).toHaveTextContent("RESULTS.csv");
    expect(screen.getByRole("button", { name: /Download official nine-file ZIP/ })).toBeEnabled();
  });

  it("checks the published reference under its declared scenario", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    await user.click(screen.getByRole("tab", { name: /Policy B/ }));
    expect(screen.getByRole("tab", { name: /Policy B/ })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: /Proof and export/ }));
    await user.click(screen.getByRole("button", { name: /Check the published reference/ }));
    expect(await screen.findByText(/Published reference submission · Scenario A/)).toBeInTheDocument();
    expect(screen.getByText(/Feasible — zero hard violations/)).toBeInTheDocument();
  });

  it("builds one official archive and keeps auxiliary artifacts separate", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    await user.click(screen.getByRole("button", { name: /Proof and export/ }));
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await user.click(screen.getByRole("button", { name: /Download official nine-file ZIP/ }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(screen.getByRole("button", { name: /Export session log/ })).toBeDisabled();
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe("reviewed urgent maintenance", () => {
  it("previews a validated replan, applies it, and can undo it", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    await user.click(screen.getByRole("button", { name: /Test urgent maintenance/ }));
    const replan = screen.getByRole("button", { name: /Re-plan around it/ });
    expect(replan).toBeEnabled();
    await user.click(replan);
    const adopt = await screen.findByRole("button", { name: /Adopt this schedule/ });
    expect(adopt).toBeEnabled();
    await user.click(adopt);
    expect(await screen.findByText("Review before apply")).toBeInTheDocument();
    expect(screen.getByText(/current schedule is unchanged until/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Apply reviewed change/ }));
    expect(screen.queryByText("Review before apply")).not.toBeInTheDocument();
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).toBeEnabled();
    await user.click(undo);
    expect(screen.getByText(/rev 3/)).toBeInTheDocument();
  }, 20_000);
});

describe("responsive controls", () => {
  it("offers mobile triage, review and proof views while marking the matrix desktop-only", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    for (const name of ["Attention", "Selected", "Review", "Proof"]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/larger screen to edit the full location-week matrix/)).toBeInTheDocument();
    const attention = screen.getByRole("tab", { name: "Attention" });
    attention.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Selected" })).toHaveAttribute("aria-selected", "true");
  });

  it("supports the session-only low-glare toggle", async () => {
    const user = userEvent.setup();
    const { container } = renderWorkbench();
    await solve(user);
    await user.click(screen.getByRole("button", { name: /Low-glare/ }));
    expect(container.querySelector(".ps1-workbench")).toHaveAttribute("data-tone", "low-glare");
    expect(screen.getByRole("button", { name: /Light mode/ })).toHaveAttribute("aria-pressed", "true");
  });
});
