import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SavedPlansWorkspace } from "@/components/plans/SavedPlansWorkspace";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { solve } from "@railplan/core/engine/solve";
import { makePlanExport } from "@/lib/exports/serialize";
import type { PlanPreview } from "@/lib/plans/workspace-types";

vi.mock("@/components/plans/PlannerInspector", () => ({
  PlannerInspector: ({snapshot,onPin}: {snapshot: import("@railplan/core/types/exports").PlanExport; onPin:(placement:import("@railplan/core/types/railplan").Placement)=>void}) => <button onClick={()=>onPin(snapshot.placements[0])}>Test pin exported placement</button>,
}));
vi.mock("@/components/notifications/PlanNotifications", () => ({
  PlanNotifications: () => null,
}));
vi.mock("@/components/notifications/NotificationSettings", () => ({
  NotificationSettings: () => null,
}));
const id = "d2393a57-2f68-43f7-948e-f231bf504f41";
const facts = buildInstanceFromLiterals();
const result = solve({ strategy: "balanced" });
const snapshot = makePlanExport({
  id,
  planningNight: facts.planningNight,
  sourceRevision: "1",
  currentSourceRevision: "1",
  inputDigest: "sha256:saved",
  facts,
  parameters: {
    planningNight: facts.planningNight,
    strategy: "balanced",
    locked: [],
  },
  result,
  createdBy: "planner",
  createdAt: "2026-09-14T00:00:00Z",
  publishedAt: null,
  supersededBy: null,
});
const summary = {
  id,
  planningNight: facts.planningNight,
  sourceRevision: "1",
  createdAt: "2026-09-14T00:00:00Z",
  publishState: "draft",
  strategy: "balanced",
};
const overview = {
  planningNight: facts.planningNight,
  nights: [
    { planningNight: facts.planningNight, startMinute: 0, endMinute: 240 },
  ],
  sourceRevision: "1",
  pendingCount: 3,
  currentPublication: null,
  versions: [summary],
  nextCursor: null,
};
const candidate: PlanPreview = {
  result: solve({ strategy: "min-changes" }),
  basis: {
    planId: id,
    sourceRevision: "1",
    solverVersion: result.solverVersion,
    constraintVersion: result.constraintVersion,
    inputDigest: "sha256:preview",
  },
  parameters: {
    planningNight: facts.planningNight,
    strategy: "min-changes",
    locked: [],
  },
  stale: false,
  currentSourceRevision: "1",
};
it("pins an exported placement without leaking display labels into strict API parameters",async()=>{
  const fetcher=setup(); const user=userEvent.setup(); await screen.findByText("Inputs current");
  await user.click(screen.getByRole("button",{name:"Test pin exported placement"}));
  await screen.findByRole("button",{name:"Discard preview"});
  const call=fetcher.mock.calls.find(([url])=>url.endsWith("/analysis"));
  const pin=JSON.parse(call![1]!.body as string).locked[0];
  expect(Object.keys(pin).sort()).toEqual(["endMinute","locked","requestId","startMinute","teamId"]);
});
const response = (data: unknown) => Response.json(data);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
function setup(
  extra?: (url: string, options?: RequestInit) => Promise<Response> | undefined,
) {
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    const override = extra?.(url, options);
    if (override) return override;
    if (url.startsWith("/api/plans/overview")) return response({ overview });
    if (url.endsWith("/export?format=json")) return response(snapshot);
    if (url.endsWith("/analysis"))
      return response({ operation: "preview", ...candidate });
    throw new Error(`Unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  render(<SavedPlansWorkspace />);
  return fetcher;
}
it("creates a parameter-only preview, blocks publication and restores saved output on discard", async () => {
  const fetcher = setup();
  const user = userEvent.setup();
  await screen.findByText("Inputs current");
  expect(
    screen.getByRole("link", { name: "Review requests →" }),
  ).toHaveAttribute("href", `/requests?planningNight=${facts.planningNight}&plan=${id}&planRequest=M-001`);
  for (const link of screen.getAllByRole("link", { name: "Demo sandbox" })) {
    expect(link).toHaveAttribute("href", `/sandbox?night=${facts.planningNight}&plan=${id}&request=M-001`);
  }
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Objective" }),
    "min-changes",
  );
  await screen.findByRole("button", { name: "Discard preview" });
  expect(
    screen.getByRole("button", { name: "Review publication" }),
  ).toBeDisabled();
  const analysis = fetcher.mock.calls.find(([url]) =>
    url.endsWith("/analysis"),
  );
  expect(JSON.parse(analysis![1]!.body as string)).toEqual({
    operation: "preview",
    strategy: "min-changes",
    locked: [],
  });
  expect(fetcher.mock.calls.some(([url]) => url === "/api/plans")).toBe(false);
  await user.click(screen.getByRole("button", { name: "View changes" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("saved");
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Discard preview" }));
  expect(screen.getByRole("combobox", { name: "Objective" })).toHaveValue(
    "balanced",
  );
  expect(
    screen.getByRole("button", { name: "Review publication" }),
  ).toBeEnabled();
});
it("blocks router Back restoration when discarding a preview is cancelled", async () => {
  window.history.replaceState(null, "", "/plans");
  setup();
  await screen.findByText("Inputs current");
  const user = userEvent.setup();
  await user.selectOptions(screen.getByRole("combobox", { name: "Objective" }), "min-changes");
  await screen.findByRole("button", { name: "Discard preview" });
  vi.stubGlobal("confirm", vi.fn(() => false));
  const router = vi.fn();
  window.addEventListener("popstate", router);
  window.history.replaceState(null, "", "/requests");
  act(() => window.dispatchEvent(new PopStateEvent("popstate")));
  expect(router).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe("/plans");
  expect(screen.getByRole("button", { name: "Discard preview" })).toBeInTheDocument();
  window.removeEventListener("popstate", router);
});
it("sends the exact preview basis when saving and does not submit computed output", async () => {
  let savedBody: Record<string, unknown> | undefined;
  setup((url, options) => {
    if (url === "/api/plans") {
      savedBody = JSON.parse(options!.body as string);
      return Promise.resolve(
        response({ plan: { id, planningNight: facts.planningNight } }),
      );
    }
  });
  const user = userEvent.setup();
  await screen.findByText("Inputs current");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Objective" }),
    "min-changes",
  );
  await screen.findByRole("button", { name: "Discard preview" });
  await user.click(
    screen.getByRole("button", { name: "Generate revised draft" }),
  );
  await waitFor(() =>
    expect(savedBody).toEqual({
      ...candidate.parameters,
      expectedBasis: candidate.basis,
    }),
  );
  expect(savedBody).not.toHaveProperty("result");
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Discard preview" }),
    ).not.toBeInTheDocument(),
  );
});
it("requires explicit discard when leaving an unsaved preview through history", async () => {
  setup();
  const user = userEvent.setup();
  await screen.findByText("Inputs current");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Objective" }),
    "min-changes",
  );
  await screen.findByRole("button", { name: "Discard preview" });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await user.click(screen.getByRole("button", { name: "Switch version" }));
  await user.click(screen.getByRole("button", { name: `Open version ${id}` }));
  expect(confirm).toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(
    screen.getByRole("button", { name: "Discard preview" }),
  ).toBeInTheDocument();
});
it("cannot save or publish a preview that reports changed source facts", async () => {
  setup((url) =>
    url.endsWith("/analysis")
      ? Promise.resolve(
          response({
            operation: "preview",
            ...candidate,
            stale: true,
            currentSourceRevision: "2",
          }),
        )
      : undefined,
  );
  const user = userEvent.setup();
  await screen.findByText("Inputs current");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Objective" }),
    "min-changes",
  );
  await screen.findByRole("button", { name: "Discard preview" });
  expect(
    screen.getByRole("button", { name: "Generate from current inputs" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Review publication" }),
  ).toBeDisabled();
});
it("does not apply a late analysis after its workspace unmounts", async () => {
  let resolve!: (r: Response) => void;
  const fetcher = vi.fn(async (url: string) =>
    url.startsWith("/api/plans/overview")
      ? response({ overview })
      : url.includes("/export?")
        ? response(snapshot)
        : new Promise<Response>((r) => {
            resolve = r;
          }),
  );
  vi.stubGlobal("fetch", fetcher);
  const view = render(<SavedPlansWorkspace />);
  const user = userEvent.setup();
  await screen.findByText("Inputs current");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Objective" }),
    "min-changes",
  );
  view.unmount();
  await act(async () =>
    resolve(response({ operation: "preview", ...candidate })),
  );
  expect(screen.queryByText("Unsaved preview")).not.toBeInTheDocument();
});
