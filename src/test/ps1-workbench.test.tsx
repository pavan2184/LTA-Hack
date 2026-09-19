import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import * as scheduling from "@railplan/ps1/engine/schedule";
import { PS1_FILES } from "@railplan/ps1/io/load";
import { SUBMISSION_FILES } from "@railplan/ps1/io/submission";
import { Ps1Workbench } from "@/components/ps1/Ps1Workbench";
import type { Ps1WorkerRequest, Ps1WorkerResponse } from "@/workers/ps1.worker";

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

async function openLocationOccupancy(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Location occupancy" }));
  expect(screen.getByRole("button", { name: "Location occupancy" })).toHaveAttribute("aria-pressed", "true");
}

async function readStoredZip(blob: Blob): Promise<Record<string, string>> {
  const buffer = await new Promise<ArrayBuffer>((resolveBuffer, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolveBuffer(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const entries: Record<string, string> = {};
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    expect(view.getUint16(offset + 8, true)).toBe(0);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 30, nameLength));
    const contentStart = offset + 30 + nameLength + extraLength;
    expect(Object.hasOwn(entries, name)).toBe(false);
    entries[name] = decoder.decode(new Uint8Array(buffer, contentStart, size));
    offset = contentStart + size;
  }
  expect(view.getUint32(offset, true)).toBe(0x02014b50);
  return entries;
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("workspace state and policy comparison", () => {
  it("starts with a private preflight and one-click public run", () => {
    renderWorkbench();
    expect(screen.getByRole("heading", { name: "Bring your work onto the plan." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Load the public instance and run/ })).toBeEnabled();
    expect(screen.getByText(/stay on this device/)).toBeInTheDocument();
  });

  it("opens policy C after a fresh solve and shows all policy outcomes", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    expect(screen.getByRole("button", { name: "Work schedule" })).toHaveAttribute("aria-pressed", "true");
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
  }, 10_000); // Two real three-scenario solves plus rendering; not a solver timing benchmark.
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

  it("replaces a solved instance while retaining successive batches in the new upload", async () => {
    const user = userEvent.setup();
    const { container } = renderWorkbench();
    await solve(user);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const firstFile = () => new File([publicInstance[PS1_FILES[0]]], PS1_FILES[0], { type: "text/csv" });
    await user.upload(input, [firstFile()]);
    expect(await screen.findByText("Missing 02_STATIONS.csv")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run all three scenarios" })).not.toBeInTheDocument();

    await user.upload(input, PS1_FILES.slice(1).map((name) =>
      new File([publicInstance[name]], name, { type: "text/csv" }),
    ));
    await user.click(await screen.findByRole("button", { name: "Run all three scenarios" }));
    await screen.findByRole("tab", { name: /Policy C/ });

    // The completed upload is now an old instance, not another partial batch.
    await user.upload(input, [firstFile()]);
    expect(await screen.findByText("Missing 02_STATIONS.csv")).toBeInTheDocument();
  }, 20_000);

  it("ignores a pending file read after the public instance replaces it", async () => {
    const user = userEvent.setup();
    const { container } = renderWorkbench();
    let finishRead!: (text: string) => void;
    const file = new File(["outdated"], PS1_FILES[0], { type: "text/csv" });
    vi.spyOn(file, "text").mockImplementation(() => new Promise((resolveRead) => { finishRead = resolveRead; }));
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, [file]);
    await solve(user);
    await act(async () => finishRead("outdated"));
    expect(screen.getByRole("tab", { name: /Policy C/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Missing 02_STATIONS.csv")).not.toBeInTheDocument();
  });

  it("cancels the previous worker and ignores queued responses when a new upload begins", async () => {
    const user = userEvent.setup();
    class DeferredWorker {
      static instances: DeferredWorker[] = [];
      onmessage: ((event: MessageEvent<Ps1WorkerResponse>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      request!: Ps1WorkerRequest;
      terminate = vi.fn();
      constructor() { DeferredWorker.instances.push(this); }
      postMessage(request: Ps1WorkerRequest) { this.request = request; }
    }
    vi.stubGlobal("Worker", DeferredWorker);
    const { container } = renderWorkbench();
    await user.click(screen.getByRole("button", { name: /Load the public instance and run/ }));
    const previous = DeferredWorker.instances[0];
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, [
      new File([publicInstance[PS1_FILES[0]]], PS1_FILES[0], { type: "text/csv" }),
    ]);
    expect(previous.terminate).toHaveBeenCalled();
    await act(async () => {
      previous.onmessage?.({ data: { id: previous.request.id, type: "progress", scenario: "A", completed: 1, total: 3 } } as MessageEvent<Ps1WorkerResponse>);
      previous.onmessage?.({ data: { id: previous.request.id, type: "complete", outcomes: [] } } as unknown as MessageEvent<Ps1WorkerResponse>);
    });
    expect(screen.getByText("Missing 02_STATIONS.csv")).toBeInTheDocument();
    expect(screen.queryByText(/Scenario A complete/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Policy C/ })).not.toBeInTheDocument();
  });
});

describe("linked timeline and inspector", () => {
  it("keeps inspector keyboard focus in the active desktop or mobile instance", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    await user.click(screen.getByRole("button", { name: /^Inspect A001:/ }));
    const inspectors = screen.getAllByRole("tablist", { name: "Inspector views" });
    expect(inspectors).toHaveLength(2);
    const tabs = inspectors.flatMap((inspector) => within(inspector).getAllByRole("tab"));
    expect(new Set(tabs.map((tab) => tab.id)).size).toBe(tabs.length);
    const mobileSummary = within(inspectors[1]).getByRole("tab", { name: "summary" });
    mobileSummary.focus();
    await user.keyboard("{ArrowRight}");
    const mobileWhy = within(inspectors[1]).getByRole("tab", { name: "why" });
    expect(mobileWhy).toHaveFocus();
    expect(mobileWhy).toHaveAttribute("aria-selected", "true");
    expect(within(inspectors[0]).getByRole("tab", { name: "summary" })).toHaveAttribute("aria-selected", "true");
  });

  it("uses a single focusable ARIA grid and arrow keys update the selected cell", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    await openLocationOccupancy(user);
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
    await openLocationOccupancy(user);
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
    await openLocationOccupancy(user);
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
    const entries = await readStoredZip(createObjectURL.mock.calls[0][0]);
    expect(Object.keys(entries).sort()).toEqual(["A", "B", "C"].flatMap((scenario) =>
      SUBMISSION_FILES.map((name) => `${scenario}/${name}`),
    ).sort());
    const headers: Record<string, string> = {
      "SCHEDULE_ACCESS.csv": "activity_id,access_seq,week,eclo,access_night",
      "SCHEDULE_OCCUPANCY.csv": "activity_id,week,location_id,co_share_group",
      "RESULTS.csv": "scenario,contract_number,simulated_completion_date,overrun_days",
    };
    for (const scenario of ["A", "B", "C"]) {
      for (const name of SUBMISSION_FILES) {
        expect(entries[`${scenario}/${name}`].split(/\r?\n/)[0]).toBe(headers[name]);
      }
      const resultRows = entries[`${scenario}/RESULTS.csv`].trim().split(/\r?\n/).slice(1);
      expect(resultRows.length).toBeGreaterThan(0);
      expect(new Set(resultRows.map((row) => row.split(",")[0]))).toEqual(new Set([scenario]));
    }
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

  it.each(["fallback", "worker"] as const)("retains applied cuts through rerun, pin and clear-pins in the %s path", async (path) => {
    if (path === "worker") {
      class SolvingWorker {
        onmessage: ((event: MessageEvent<Ps1WorkerResponse>) => void) | null = null;
        onerror: ((event: ErrorEvent) => void) | null = null;
        terminate() {}
        postMessage(request: Ps1WorkerRequest) {
          queueMicrotask(() => this.onmessage?.({ data: {
            id: request.id,
            type: "complete",
            outcomes: request.scenarios.map((scenario) => scheduling.solveInstance(request.instance, {
              scenario,
              pins: request.pins,
              disruptions: request.disruptions?.[scenario] ?? [],
            })),
          } } as MessageEvent<Ps1WorkerResponse>));
        }
      }
      vi.stubGlobal("Worker", SolvingWorker);
    } else vi.stubGlobal("Worker", undefined);
    const solveSpy = vi.spyOn(scheduling, "solveInstance");
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    await user.click(screen.getByRole("button", { name: /Test urgent maintenance/ }));
    const cut = {
      locationId: (screen.getByRole("combobox", { name: "Location" }) as HTMLSelectElement).value,
      fromWeek: Number((screen.getByRole("spinbutton", { name: "From week" }) as HTMLInputElement).value),
      toWeek: Number((screen.getByRole("spinbutton", { name: "To week" }) as HTMLInputElement).value),
      capacity: Number((screen.getByRole("spinbutton", { name: /Reduced to/ }) as HTMLInputElement).value),
    };
    await user.click(screen.getByRole("button", { name: /Re-plan around it/ }));
    await user.click(await screen.findByRole("button", { name: /Adopt this schedule/ }));
    await user.click(screen.getByRole("button", { name: /Apply reviewed change/ }));

    const expectCutPreserved = () => {
      const options = solveSpy.mock.calls.slice(-3).map((call) => call[1]);
      expect(options.map((entry) => entry?.scenario)).toEqual(["A", "B", "C"]);
      expect(options.find((entry) => entry?.scenario === "C")?.disruptions).toEqual([cut]);
      expect(options.filter((entry) => entry?.scenario !== "C").every((entry) => entry?.disruptions?.length === 0)).toBe(true);
    };

    await user.click(screen.getByRole("button", { name: "Re-run" }));
    await screen.findByRole("tab", { name: /Policy C/ });
    expectCutPreserved();
    await user.click(screen.getByRole("button", { name: "Selected details" }));
    await user.click(screen.getAllByRole("button", { name: /^Pin wk/ })[0]);
    await screen.findByText("Review before apply");
    expectCutPreserved();
    await user.click(screen.getByRole("button", { name: /Apply reviewed change/ }));
    await user.click(screen.getByRole("button", { name: "Clear all pins" }));
    await screen.findByText("Review before apply");
    expectCutPreserved();
  }, 30_000);
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
