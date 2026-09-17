import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { PS1_FILES } from "@railplan/ps1/io/load";
import { SUBMISSION_FILES } from "@railplan/ps1/io/submission";
import { Ps1Workbench } from "@/components/ps1/Ps1Workbench";

/**
 * The judging surface had no test at all, which for the one page a panel opens
 * cold is the wrong thing to leave uncovered. These are smoke tests: they drive
 * the real engine over the real published instance and assert the things a
 * judge would notice if they broke — that one click produces a scored answer,
 * that the numbers on screen are the engine's, and that the actions do what
 * their own descriptions say they do.
 */

const publicInstance = Object.fromEntries(
  PS1_FILES.map((name) => [
    name,
    readFileSync(resolve("packages/ps1/data/public", name), "utf8"),
  ]),
);
const referenceSubmission = Object.fromEntries(
  SUBMISSION_FILES.map((name) => [
    name,
    readFileSync(resolve("packages/ps1/data/sample-submission", name), "utf8"),
  ]),
);

function renderWorkbench() {
  return render(
    <Ps1Workbench
      publicInstance={publicInstance}
      referenceSubmission={referenceSubmission}
    />,
  );
}

/**
 * The timeline's own rows. `rowheader` alone also matches the scenario
 * comparison table, whose first column is a row header too.
 */
function timelineRows() {
  const grid = screen.getByRole("table", { name: /Possessions per location per week/ });
  return within(grid).getAllByRole("rowheader");
}

/** Load and solve in the one click the page now offers. */
async function solve(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Load the public instance and run/ }));
}

beforeAll(() => {
  // jsdom has no layout, so the timeline's scroll container is inert here; the
  // component only needs the call not to throw.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("cold start", () => {
  it("says why the run button is disabled before an instance is loaded", () => {
    renderWorkbench();
    const run = screen.getByRole("button", { name: /Run all three scenarios/ });
    expect(run).toBeDisabled();
    expect(screen.getByText(/stays disabled until all eight files are present/)).toBeInTheDocument();
  });

  it("goes from nothing to three scored scenarios in one click", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    expect(screen.queryByText("3. Result")).not.toBeInTheDocument();

    await solve(user);

    expect(screen.getByText("3. Result")).toBeInTheDocument();
    for (const scenario of ["A", "B", "C"]) {
      expect(
        screen.getByRole("tab", { name: new RegExp(`Scenario ${scenario}`) }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("Public instance loaded — 8/8 files")).toBeInTheDocument();
  });

  /**
   * The comparison is the whole reason three scenarios are solved rather than
   * one, and it must show every scenario at once rather than the active tab.
   */
  it("compares all three scenarios in one table", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);

    const comparison = screen.getByRole("table", { name: /Every scenario compared/ });
    const rows = within(comparison).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    // Scenario A on the published instance: feasible, 21 overrun days, no
    // excess nights and no early closure. A change here is an engine change.
    expect(within(rows[0]).getByRole("rowheader")).toHaveTextContent("A");
    expect(rows[0]).toHaveTextContent("25.2");
    expect(rows[0]).toHaveTextContent("21");
  });

  it("declines to rank the scenarios against each other", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    // Each scenario scores under its own rules, so a "best" column would be a
    // category error. The caption has to keep saying so.
    expect(
      screen.getByText(/scores are not comparable across\s+scenarios, only within one/),
    ).toBeInTheDocument();
  });
});

describe("uploading an instance", () => {
  it("names the files it ignored rather than dropping them silently", async () => {
    const user = userEvent.setup();
    const { container } = renderWorkbench();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, [
      new File(["x"], "01_LINES.csv", { type: "text/csv" }),
      new File(["x"], "my-notes.csv", { type: "text/csv" }),
      new File(["x"], "STATIONS-v2.csv", { type: "text/csv" }),
    ]);

    const warning = (await screen.findByText(/Ignored 2 files/)).closest("p")!;
    expect(warning).toHaveTextContent("my-notes.csv");
    expect(warning).toHaveTextContent("STATIONS-v2.csv");
    expect(screen.getByText("Missing 02_STATIONS.csv")).toBeInTheDocument();
  });
});

describe("checking a submission", () => {
  /**
   * The strongest claim this tool makes is that its validator is the judges'
   * rules and not a private stricter reading. The reference answer is the only
   * evidence available for that, so it has to keep passing.
   */
  it("accepts the organisers' reference submission as feasible", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);

    await user.click(screen.getByRole("button", { name: /Check the published reference/ }));

    expect(await screen.findByText(/Feasible — zero hard violations/)).toBeInTheDocument();
    expect(screen.getByText(/Published reference submission · Scenario A/)).toBeInTheDocument();
  });

  it("scores our own answer against it under the same rules", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    await user.click(screen.getByRole("button", { name: /Check the published reference/ }));

    const verdict = await screen.findByText(/Our scenario A answer scores/);
    expect(verdict).toHaveTextContent("25.2");
    expect(verdict).toHaveTextContent("32.2");
    expect(verdict).toHaveTextContent(/ours costs less under the same rules/);
  });

  it("reads the scenario from the submission, not the open tab", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);
    await user.click(screen.getByRole("tab", { name: /Scenario B/ }));
    await user.click(screen.getByRole("button", { name: /Check the published reference/ }));

    // The reference declares Scenario A. Judging it under B's rules would
    // manufacture three planned-date failures that are not its fault.
    const check = screen.getByText("4. Check a submission").closest("section")!;
    expect(
      await within(check).findByText(/Published reference submission · Scenario A/),
    ).toBeInTheDocument();
    expect(within(check).getByText(/Feasible — zero hard violations/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Scenario B/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("refuses a partial submission and says which file is missing", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);

    const section = screen.getByText("4. Check a submission").closest("section")!;
    const input = section.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [new File(["scenario,contract_number\n"], "RESULTS.csv")]);

    expect(
      await screen.findByText(/Missing SCHEDULE_ACCESS.csv, SCHEDULE_OCCUPANCY.csv/),
    ).toBeInTheDocument();
  });
});

describe("the timeline drives the rest of the page", () => {
  it("pins a week and offers to release it again", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);

    const cell = screen.getAllByRole("button", { name: /week \d+, \d+ of \d+ possessions/ })[0];
    await user.click(cell);

    const pin = await screen.findByRole("button", { name: /Pin to this week/ });
    await user.click(pin);

    expect(await screen.findByRole("button", { name: /Pinned here/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear 1 pin/ })).toBeInTheDocument();
  });

  it("aims urgent maintenance at the location-week that was clicked", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);

    const cell = screen.getAllByRole("button", { name: /week \d+, \d+ of \d+ possessions/ })[0];
    const label = cell.getAttribute("aria-label")!;
    const place = label.slice(0, label.indexOf(" week "));

    await user.click(cell);
    await user.click(await screen.findByRole("button", { name: /Cut this location-week/ }));

    const picker = screen.getByRole("combobox", { name: /Location/ });
    expect(within(picker).getByRole("option", { selected: true })).toHaveTextContent(place);
  });

  it("holds the same vocabulary for a location in the grid and the picker", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);

    const cell = screen.getAllByRole("button", { name: /week \d+, \d+ of \d+ possessions/ })[0];
    const label = cell.getAttribute("aria-label")!;
    const place = label.slice(0, label.indexOf(" week "));

    // "ALP S01 EB", not "PLAT:ALP:S01:EB" — the raw id is secondary everywhere
    // it still appears.
    expect(place).not.toContain(":");

    // The picker lives in the urgent-maintenance dialog now, so it has to be
    // opened before it can be compared against the grid.
    await user.click(cell);
    await user.click(await screen.findByRole("button", { name: /Cut this location-week/ }));
    const picker = await screen.findByRole("combobox", { name: /Location/ });
    expect(within(picker).getAllByRole("option")[0].textContent).not.toMatch(/^[A-Z]+:/);
  });
});

describe("narrowing the grid", () => {
  /**
   * Sixty-seven rows on the published instance, and a hidden one could be
   * larger. Scrolling is not a way to find a location.
   */
  it("finds a location by name", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);

    const before = timelineRows().length;
    await user.type(screen.getByRole("searchbox", { name: /Find a location/ }), "H01");
    const after = timelineRows();

    expect(after.length).toBeLessThan(before);
    expect(after.length).toBeGreaterThan(0);
    for (const row of after) expect(row.textContent).toMatch(/H01/);
  });

  it("filters down to the locations that fill up", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);

    const capacity = screen.getByRole("button", { name: "At capacity" });
    await user.click(capacity);
    expect(capacity).toHaveAttribute("aria-pressed", "true");

    // The heading states the count independently; the grid must agree with it.
    const stated = screen
      .getByText(/of \d+ locations reach capacity in some week/)
      .textContent!.match(/^(\d+)/)![1];
    expect(timelineRows()).toHaveLength(Number(stated));
  });

  it("offers a way out when the filters match nothing", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);

    await user.type(screen.getByRole("searchbox", { name: /Find a location/ }), "ZZZZ");
    expect(screen.getByText(/No location matches those filters/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear them" }));
    expect(timelineRows().length).toBeGreaterThan(0);
  });

  it("keeps the selected location-week beside the grid, not under it", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);

    expect(screen.getByText("Nothing selected")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /week \d+, \d+ of \d+ possessions/ })[0]);

    expect(screen.queryByText("Nothing selected")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cut this location-week/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Close this location-week/ }));
    expect(screen.getByText("Nothing selected")).toBeInTheDocument();
  });
});

describe("downloads", () => {
  it("offers the whole submission as one archive", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    await solve(user);

    const zip = screen.getByRole("button", { name: /Download all three scenarios/ });
    expect(zip).toBeInTheDocument();
    expect(
      screen.getByText(/One archive, nine CSVs, foldered A\/ B\/ C\//),
    ).toBeInTheDocument();

    // jsdom has no download machinery; assert the blob was built and handed over.
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await user.click(zip);

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledOnce();

    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
