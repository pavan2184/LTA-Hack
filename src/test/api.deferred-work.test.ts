// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/permissions";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), record: vi.fn(), get: vi.fn(), list: vi.fn(), act: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireActor: mocks.auth }));
vi.mock("@/lib/deferred-work/service", async original => ({ ...(await original<object>()), recordDeferral: mocks.record, getWorkItem: mocks.get, listWorkItems: mocks.list, actOnWorkItem: mocks.act }));
import { DeferredWorkError } from "@/lib/deferred-work/service";
const id = "00000000-0000-4000-8000-000000000001";
const body = { planId: id, requestId: "M-001", reason: "Record historical deferral", idempotencyKey: id };
const request = (value: unknown, headers: Record<string, string> = {}) => new Request("http://localhost/api/deferred-work", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(value) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ identity: { id: "verified" }, actor: { role: "planner" } });
  mocks.record.mockResolvedValue({ id }); mocks.list.mockResolvedValue({ items: [], nextCursor: null, nights: [], today: "2026-09-16" });
});
describe("deferred-work HTTP boundary", () => {
  it("authenticates before parsing and preserves unavailable/unauthorized responses", async () => {
    const { POST } = await import("@/app/api/deferred-work/route");
    for (const [code, status] of [["unauthenticated", 401], ["forbidden", 403], ["auth_unavailable", 503]] as const) {
      mocks.auth.mockRejectedValueOnce(new AuthError(code));
      expect((await POST(request({}))).status).toBe(status);
    }
  });
  it("requires same-origin strict bounded JSON and returns an exact saved work item", async () => {
    const { POST } = await import("@/app/api/deferred-work/route");
    expect((await POST(request(body, { origin: "https://foreign.example" }))).status).toBe(403);
    expect((await POST(request({ ...body, actorId: id }))).status).toBe(400);
    expect((await POST(request({ ...body, reason: "x".repeat(66000) }))).status).toBe(413);
    const response = await POST(request(body));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ workItem: { id } });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects duplicate/unknown query keys, oversized paging and bad detail IDs", async () => {
    const { GET } = await import("@/app/api/deferred-work/route");
    for (const query of ["limit=51", "limit=1&limit=2", "state=approved", "actorId=" + id, "cursor=wrong"]) expect((await GET(new Request("http://localhost/api/deferred-work?" + query))).status).toBe(400);
    const detail = await import("@/app/api/deferred-work/[id]/route");
    expect((await detail.GET(new Request("http://localhost"), { params: Promise.resolve({ id: "wrong" }) })).status).toBe(400);
    mocks.get.mockRejectedValueOnce(new DeferredWorkError("not_found"));
    expect((await detail.GET(new Request("http://localhost"), { params: Promise.resolve({ id }) })).status).toBe(404);
  });
  it("requires expected versions and lifecycle notes and maps conflicts without leaking exceptions", async () => {
    const { POST } = await import("@/app/api/deferred-work/[id]/actions/route");
    const context = { params: Promise.resolve({ id }) };
    expect((await POST(request({ action: "complete", expectedVersion: 1 }), context)).status).toBe(400);
    expect((await POST(request({ action: "complete", note: "Done" }), context)).status).toBe(400);
    mocks.act.mockRejectedValueOnce(new DeferredWorkError("conflict"));
    const conflict = await POST(request({ action: "complete", expectedVersion: 1, note: "Done" }), context);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.message).toMatch(/reload/i);
    mocks.act.mockRejectedValueOnce(new Error("private SQL connection secret"));
    const failure = await POST(request({ action: "complete", expectedVersion: 1, note: "Done" }), context);
    expect(failure.status).toBe(500);
    expect(await failure.text()).not.toContain("private SQL");
  });
});
