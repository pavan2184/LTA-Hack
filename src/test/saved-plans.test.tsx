import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SavedPlansWorkspace } from "@/components/plans/SavedPlansWorkspace";
import { plannerExport, plannerInspection, plannerOverview, plannerVersion } from "./fixtures/planner-workspace";
vi.mock("@/components/notifications/PlanNotifications", () => ({ PlanNotifications: () => null }));
vi.mock("@/components/notifications/NotificationSettings", () => ({ NotificationSettings: () => null }));
const saved = plannerVersion();
beforeEach(() => window.history.replaceState(null, "", "/plans"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const ready = () => screen.findByRole("button", { name: "Version details" });
it("links Add request to creation with the selected night and version", async () => {
  setup(); render(<SavedPlansWorkspace />); await ready();
  const link = screen.getByRole("link", { name: "Add request" });
  const query = new URL(link.getAttribute("href")!, "http://localhost").searchParams;
  expect(query.get("request")).toBe("new");
  expect(query.get("planningNight")).toBe(saved.planningNight);
  expect(query.get("plan")).toBe(saved.id);
});
function setup(initial = saved, custom?: (url: string, init?: RequestInit) => Response | undefined) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const special = custom?.(url, init); if (special) return special;
    if (url.startsWith("/api/deferred-work")) return Response.json({ items: [], nextCursor: null, today: "2026-09-15", nights: [], owners: [] });
    if (url.endsWith("/analysis")) return plannerInspection(url, init);
    if (url.startsWith("/api/plans/overview")) return Response.json(plannerOverview([initial]));
    return Response.json(plannerExport(initial));
  });
  vi.stubGlobal("fetch", fetcher); return fetcher;
}
async function publish(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Review publication" }));
  await user.click(screen.getByRole("button", { name: "Publish this version" }));
}
it("creates a durable server version and displays its saved placements and provenance", async () => {
  let generated = false;
  const fetcher = setup(saved, (url) => {
    if (url.startsWith("/api/plans/overview")) return Response.json(plannerOverview(generated ? [saved] : []));
    if (url === "/api/plans") { generated = true; return Response.json({ plan: saved }, { status: 201 }); }
  });
  const user = userEvent.setup(); render(<SavedPlansWorkspace />);
  await screen.findByText("No saved versions for this night.");
  await user.click(screen.getByRole("button", { name: "Generate and save plan" })); await ready();
  const gantt = screen.getByRole("region", { name: "Saved block Gantt" });
  for (const p of saved.placements) expect(within(gantt).getAllByRole("button", { name: new RegExp("Select " + p.requestId + " on") }).length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Version details" }));
  expect(screen.getByText(saved.id)).toBeInTheDocument(); expect(screen.getByText(saved.inputDigest)).toBeInTheDocument();
  expect(JSON.parse(fetcher.mock.calls.find(([url]) => url === "/api/plans")![1]!.body as string)).toEqual({ planningNight: saved.planningNight, strategy: "balanced", locked: [] });
});
it("keeps the saved plan visible and explains stale publication instead of claiming success", async () => {
  setup(saved, (url) => url.endsWith("/publish") ? Response.json({ error: { code: "stale_plan", message: "Source changed. Generate a new plan." } }, { status: 409 }) : undefined);
  const user = userEvent.setup(); render(<SavedPlansWorkspace />); await ready(); await publish(user);
  await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Source changed. Generate a new plan."));
  expect(screen.getByRole("region", { name: "Saved block Gantt" })).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Plan operation status" })).not.toHaveTextContent(/Plan published/);
});
it("shows a recoverable load error without presenting an empty saved history as success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network"))); render(<SavedPlansWorkspace />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to reach RailPlan");
  expect(screen.queryByText("No saved versions for this night.")).not.toBeInTheDocument();
});
it("renders published versions read-only and records review notes separately", async () => {
  const fetcher = setup(plannerVersion({ publishState: "published", publishedAt: saved.createdAt }), (url) => url.endsWith("/decisions") ? Response.json({ decision: { id: "decision-id" } }, { status: 201 }) : undefined);
  const user = userEvent.setup(); render(<SavedPlansWorkspace />); await ready();
  expect(screen.getByRole("button", { name: "Current publication" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Version details" }));
  await user.type(screen.getByRole("textbox", { name: "Reason" }), "Review recorded after publication.");
  await user.click(screen.getByRole("button", { name: "Record decision" }));
  await waitFor(() => expect(screen.getByRole("status", { name: "Review decision status" })).toHaveTextContent("Decision recorded in the audit history."));
  expect(JSON.parse(fetcher.mock.calls.find(([url]) => url.endsWith("/decisions"))![1]!.body as string)).toEqual({ kind: "note", reason: "Review recorded after publication." });
  expect(screen.getByText(saved.id)).toBeInTheDocument();
});
it("does not claim publication when another planner already superseded the selected version", async () => {
  let current = saved;
  setup(saved, (url) => {
    if (url.endsWith("/publish")) { current = plannerVersion({ publishState: "superseded", publishedAt: saved.createdAt, supersededBy: "new-current-id" }); return Response.json({ plan: current }); }
    if (url.startsWith("/api/plans/overview")) return Response.json(plannerOverview([current]));
    if (url.includes("/export?")) return Response.json(plannerExport(current));
  });
  const user = userEvent.setup(); render(<SavedPlansWorkspace />); await ready(); await publish(user);
  await screen.findByRole("heading", { name: "Saved version details" }); await user.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.getByRole("status", { name: "Plan operation status" })).toHaveTextContent("already been superseded"));
  expect(screen.getByRole("status", { name: "Plan operation status" })).not.toHaveTextContent(/Plan published/);
});
it("clears old-night versions when a different night fails to load", async () => {
  setup(saved, (url) => { if (url.includes("planningNight=2026-09-17")) throw new TypeError("network"); });
  render(<SavedPlansWorkspace />); await ready();
  fireEvent.change(screen.getByLabelText("Planning night"), { target: { value: "2026-09-17" } });
  await screen.findByRole("alert");
  expect(screen.queryByRole("region", { name: "Saved block Gantt" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Switch version" }));
  expect(screen.queryByRole("button", { name: /Open version/ })).not.toBeInTheDocument();
});
it("refreshes publication state and prevents publishing a newly superseded version", async () => {
  let refresh = false;
  setup(saved, (url) => {
    const version = refresh ? plannerVersion({ publishState: "superseded", publishedAt: saved.createdAt, supersededBy: "new-current-id" }) : saved;
    if (url.startsWith("/api/plans/overview")) return Response.json(plannerOverview([version]));
    if (url.includes("/export?")) return Response.json(plannerExport(version));
  });
  const user = userEvent.setup(); render(<SavedPlansWorkspace />); await ready();
  expect(screen.getByRole("button", { name: "Review publication" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Switch version" })); refresh = true;
  await user.click(screen.getByRole("button", { name: "Refresh versions" }));
  expect(await screen.findByRole("button", { name: "Superseded version" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Review publication" })).not.toBeInTheDocument();
});
