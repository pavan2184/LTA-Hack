import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceNavigation } from "@/components/layout/WorkspaceNavigation";
import { safeReturnTo } from "@/lib/auth/return-path";
import Contractor from "@/app/contractor/page";
import ContractorDrafts from "@/app/contractor/drafts/page";
import DeferredWorkPage from "@/app/plans/deferred/page";
import { PlannerInspector } from "@/components/plans/PlannerInspector";
import { plannerExport, plannerInspection } from "./fixtures/planner-workspace";

const { actor } = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock("@/lib/auth/page", () => ({ workspaceActor: actor }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/components/auth/SignOut", () => ({ SignOut: () => <button>Sign out</button> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("links the planner backlog with exact night and plan context", () => {
  render(<WorkspaceNavigation role="planner" current="plans" planningNight="2026-09-16" planId="version-1" requestId="M-014" />);
  expect(screen.getByRole("link", { name: "Deferred work" })).toHaveAttribute("href", "/plans/deferred?night=2026-09-16&plan=version-1&request=M-014");
});
it.each([null, { role: "contractor" }])("keeps the planner backlog server-gated for %s", async identity => {
  actor.mockResolvedValue(identity);
  await expect(DeferredWorkPage({ searchParams: Promise.resolve({ work: "abc-123", note: "private" }) })).rejects.toThrow("redirect:/");
  expect(actor).toHaveBeenCalledWith("/plans/deferred?work=abc-123");
});
it("keeps deferred URL identifiers through login and rejects the planner path for contractors", () => {
  expect(safeReturnTo("/plans/deferred?work=abc-123&night=2026-09-16&plan=version-1&note=private", "planner")).toBe("/plans/deferred?work=abc-123&night=2026-09-16&plan=version-1");
  expect(safeReturnTo("/contractor?work=abc-123&reason=private", "contractor")).toBe("/contractor?work=abc-123");
  expect(safeReturnTo("/plans/deferred?work=abc-123", "contractor")).toBe("/contractor");
});
it("threads a contractor exact work ID through composition and login context", async () => {
  actor.mockResolvedValue({ role: "contractor" });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/deferred-work/abc-123") return Response.json({ error: { message: "Exact work item unavailable" } }, { status: 404 });
    if (url.startsWith("/api/deferred-work")) return Response.json({ items: [], nextCursor: null, nights: [], today: "2026-09-15" });
    if (url.startsWith("/api/coordination")) return Response.json({ cases: [], nextCursor: null });
    if (url === "/api/requests/catalogue") return Response.json({ catalogue: { nights: [], blocks: [], workClasses: [], equipment: [], roles: [] } });
    return Response.json({ requests: [] });
  }));
  render(await Contractor({ searchParams: Promise.resolve({ work: "abc-123", reason: "private" }) }));
  expect(actor).toHaveBeenCalledWith("/contractor?work=abc-123");
  expect(await screen.findByText(/Exact work item unavailable/)).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Audit history" })).not.toBeInTheDocument();
});
it("excludes backlog and work identifiers from private draft pages", async () => {
  actor.mockResolvedValue({ role: "contractor" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ drafts: [] })));
  render(await ContractorDrafts({ searchParams: Promise.resolve({ work: "abc-123" }) }));
  expect(actor).toHaveBeenCalledWith("/contractor/drafts");
  expect(screen.queryByRole("heading", { name: "Deferred work" })).not.toBeInTheDocument();
});
it("offers explicit saved deferral recording in the inspector, with previews disabled", async () => {
  const snapshot = plannerExport();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => plannerInspection(url, init)));
  render(<PlannerInspector snapshot={snapshot} plan={{ placements: snapshot.placements, deferred: snapshot.deferrals }} preview={null} selectedRequestId={snapshot.deferrals[0].requestId} disabled={false} onPin={() => {}} onUnpin={() => {}} onSelectRequest={() => {}} />);
  expect(await screen.findByRole("button", { name: "Record deferral" })).toBeEnabled();
});
