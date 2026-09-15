import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Review from "@/app/requests/page";
import Contractor from "@/app/contractor/page";
import PlannerDrafts from "@/app/requests/drafts/page";
import ContractorDrafts from "@/app/contractor/drafts/page";

const { actor } = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock("@/lib/auth/page", () => ({ workspaceActor: actor }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/components/auth/SignOut", () => ({ SignOut: () => <button>Sign out</button> }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("restores an exact contractor case and keeps a missing foreign case from falling back", async () => {
  const caseId = "10000000-0000-4000-8000-000000000099";
  actor.mockResolvedValue({ role: "contractor" });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === `/api/coordination/${caseId}`) return Response.json({ error: { message: "This coordination case does not exist." } }, { status: 404 });
    if (url.startsWith("/api/coordination")) return Response.json({ cases: [], nextCursor: null });
    if (url.startsWith("/api/requests/catalogue")) return Response.json({ catalogue: { nights: [], blocks: [], workClasses: [], equipment: [], roles: [] } });
    if (url.startsWith("/api/requests")) return Response.json({ requests: [] });
    throw new Error(`Unexpected request ${url}`);
  }));
  render(await Contractor({ searchParams: Promise.resolve({ planningNight: "2098-01-01", case: caseId, request: "request-1", note: "do not carry" }) }));
  expect(actor).toHaveBeenCalledWith(`/contractor?planningNight=2098-01-01&request=request-1&case=${caseId}`);
  expect(await screen.findByText("This coordination case does not exist.")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: /Coordination case / })).not.toBeInTheDocument();
});

it.each([
  [Review, "planner"], [PlannerDrafts, "planner"], [Contractor, "contractor"], [ContractorDrafts, "contractor"],
] as const)("gates request pages by their trusted role (%s)", async (Page, role) => {
  actor.mockResolvedValue({ role: role === "planner" ? "contractor" : "planner" });
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/");
});

it("preserves only supported context in a private-draft login return destination", async () => {
  actor.mockResolvedValue({ role: "planner" });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/ingestions/drafts") return Response.json({ drafts: [] });
    return Response.json({ error: { message: "Draft not found" } }, { status: 404 });
  }));
  render(await PlannerDrafts({ searchParams: Promise.resolve({ planningNight: "2026-09-16", plan: "plan-1", planRequest: "M-014", draft: "draft-1", case: "not-a-private-draft-context", transcript: "private text", request: ["ambiguous"] }) }));
  expect(actor).toHaveBeenCalledWith("/requests/drafts?planningNight=2026-09-16&plan=plan-1&planRequest=M-014&draft=draft-1");
  expect(screen.getByRole("link", { name: "Back to night overview" })).toHaveAttribute("href", "/plans?night=2026-09-16&plan=plan-1&request=M-014");
  expect(await screen.findByText("Draft not found")).toBeInTheDocument();
});
