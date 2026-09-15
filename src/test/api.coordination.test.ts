// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/permissions";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), get: vi.fn(), list: vi.fn(), act: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireActor: mocks.auth }));
vi.mock("@/lib/coordination/service", async original => ({ ...(await original<object>()), createCase: mocks.create, getCase: mocks.get, listCases: mocks.list, actOnCase: mocks.act }));
import { CoordinationError } from "@/lib/coordination/service";
const id = "00000000-0000-4000-8000-000000000001";
const body = { sourcePlanId: id, selectedRequestIds: ["M-001"], idempotencyKey: id, parameters: { planningNight: "2026-08-03", strategy: "balanced", locked: [] } };
const request = (value: unknown, headers: Record<string, string> = {}) => new Request("http://localhost/api/coordination", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(value) });
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ identity: { id: "verified" }, actor: { role: "planner" } }); mocks.create.mockResolvedValue({ id }); mocks.list.mockResolvedValue({ cases: [], nextCursor: null }); });
describe("coordination HTTP boundaries", () => {
  it("authenticates before parsing and preserves auth failure statuses", async () => {
    const { POST } = await import("@/app/api/coordination/route");
    for (const [code, status] of [["unauthenticated",401],["forbidden",403],["auth_unavailable",503]] as const) {
      mocks.auth.mockRejectedValueOnce(new AuthError(code));
      expect((await POST(request({}))).status).toBe(status);
    }
  });
  it("rejects foreign origin, caller outputs and oversized selectors", async () => {
    const { POST } = await import("@/app/api/coordination/route");
    expect((await POST(request(body, { origin: "https://foreign.example" }))).status).toBe(403);
    expect((await POST(request({ ...body, result: {} }))).status).toBe(400);
    expect((await POST(request({ ...body, selectedRequestIds: Array(101).fill("M-001") }))).status).toBe(400);
    const saved = await POST(request(body));
    expect(saved.status).toBe(201);
    expect(await saved.json()).toEqual({ case: { id } });
    expect(saved.headers.get("cache-control")).toBe("no-store");
  });
  it("requires a revision and expected version for Apply and maps conflicts to reload errors", async () => {
    const { POST } = await import("@/app/api/coordination/[id]/actions/route");
    const context = { params: Promise.resolve({ id }) };
    expect((await POST(request({ action: "apply", revision: 1, idempotencyKey: id }), context)).status).toBe(400);
    mocks.act.mockRejectedValueOnce(new CoordinationError("conflict"));
    const result = await POST(request({ action: "apply", revision: 1, expectedVersion: 1, idempotencyKey: id }), context);
    expect(result.status).toBe(409);
    expect((await result.json()).error.message).toMatch(/reload/i);
  });
  it("validates UUIDs, bounded paging and returns no internal exception details", async () => {
    const { GET } = await import("@/app/api/coordination/route");
    expect((await GET(new Request("http://localhost/api/coordination?limit=51"))).status).toBe(400);
    const detail = await import("@/app/api/coordination/[id]/route");
    expect((await detail.GET(new Request("http://localhost"), { params: Promise.resolve({ id: "foreign" }) })).status).toBe(400);
    mocks.list.mockRejectedValueOnce(new Error("database secret"));
    const response = await GET(new Request("http://localhost/api/coordination"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("database secret");
  });
});
