import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SavedPlansWorkspace } from "@/components/plans/SavedPlansWorkspace";
import { buildInstanceFromLiterals } from "@railplan/core/domain/instance";
import { solve } from "@railplan/core/engine/solve";
import {
  makePlanExport,
  type SavedExportRecord,
} from "@/lib/exports/serialize";
import type { PlanVersion } from "@railplan/core/types/plans";
const id = "71384128-9bbb-4c62-bc02-44cefead01b2";
const facts = buildInstanceFromLiterals(),
  result = solve({ strategy: "balanced" });
const record: SavedExportRecord = {
  id,
  planningNight: facts.planningNight,
  sourceRevision: "21",
  currentSourceRevision: "21",
  inputDigest: "sha256:combined-journey",
  facts,
  parameters: {
    planningNight: facts.planningNight,
    strategy: "balanced",
    locked: [],
  },
  result,
  createdBy: "planner",
  createdAt: "2026-09-07T00:00:00.000Z",
  publishedAt: null,
  supersededBy: null,
};
const saved: PlanVersion = {
  ...result.plan,
  id,
  planningNight: facts.planningNight,
  sourceRevision: "21",
  inputDigest: record.inputDigest,
  strategy: "balanced",
  solverVersion: result.solverVersion,
  constraintVersion: result.constraintVersion,
  status: result.status,
  objectives: result.objective,
  metrics: result.metrics,
  validation: { independentlyValidated: true, violations: result.violations },
  createdBy: "planner",
  createdAt: record.createdAt,
  publishState: "draft",
  publishedAt: null,
  supersededBy: null,
};
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("connects generation, saved Gantt review, publication status and exact snapshot download", async () => {
  let published = false;
  const snapshotStates: string[] = [];
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.startsWith("/api/plans?")) return Response.json({ plans: [] });
    if (url === "/api/plans" && options?.method === "POST")
      return Response.json({ plan: saved }, { status: 201 });
    if (url === `/api/plans/${id}/publish`) {
      published = true;
      return Response.json({
        plan: {
          ...saved,
          publishState: "published",
          publishedAt: record.createdAt,
        },
        notificationsWarning: null,
      });
    }
    if (url === `/api/plans/${id}/export?format=json`) {
      snapshotStates.push(published ? "published" : "draft");
      return Response.json(
        makePlanExport({
          ...record,
          publishedAt: published ? record.createdAt : null,
        }),
      );
    }
    if (url === `/api/plans/${id}/notifications`)
      return Response.json({ deliveries: [] });
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  const create = vi.fn(() => "blob:combined-journey"),
    revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: create,
      revokeObjectURL: revoke,
    }),
  );
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  const user = userEvent.setup();
  render(<SavedPlansWorkspace />);
  await screen.findByText("No saved versions for this night.");
  await user.click(
    screen.getByRole("button", { name: "Generate and save plan" }),
  );
  const gantt = await screen.findByRole("region", {
    name: "Saved block Gantt",
  });
  const first = result.plan.placements[0];
  await user.click(
    within(gantt).getAllByRole("button", {
      name: new RegExp(`Select ${first.requestId} on`),
    })[0],
  );
  expect(
    screen.getByRole("region", { name: "Saved request inspector" }),
  ).toHaveTextContent(
    facts.requests.find((r) => r.id === first.requestId)!.title,
  );
  await user.click(
    screen.getByRole("button", { name: "Publish this version" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("status", { name: "Plan operation status" }),
    ).toHaveTextContent("Plan published."),
  );
  await screen.findByRole("region", { name: "Saved block Gantt" });
  expect(snapshotStates).toEqual(["draft", "published"]);
  await user.click(screen.getByRole("button", { name: "Download JSON" }));
  await waitFor(() => expect(click).toHaveBeenCalledOnce());
  const payload = JSON.parse(
    await (create.mock.calls[0] as unknown as [Blob])[0].text(),
  );
  expect(payload.provenance.planId).toBe(id);
  expect(payload.assessment.publicationState).toBe("published");
  expect(
    payload.placements.map(({ requestId }: { requestId: string }) => requestId),
  ).toEqual(result.plan.placements.map((p) => p.requestId));
  expect(
    screen.getByRole("button", { name: "Publish this version" }),
  ).toBeDisabled();
});
