// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/permissions";
import { PlanError } from "@/lib/plans/input";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  publish: vi.fn(),
  decision: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireActor: mocks.auth }));
vi.mock("@/lib/plans/service", () => ({
  createPlan: mocks.create,
  getPlan: mocks.get,
  listPlans: mocks.list,
  publishPlan: mocks.publish,
  recordDecision: mocks.decision,
}));
vi.mock("@/lib/notifications/service", () => ({
  dispatchPlanNotifications: vi.fn(),
}));
const id = "fd8d3e80-c056-4ab2-a6b4-2f76c569b665";
const context = { params: Promise.resolve({ id }) };
const request = (body: unknown) =>
  new Request("http://localhost/api/plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    identity: { id: "verified" },
    actor: { role: "planner" },
  });
  mocks.create.mockResolvedValue({ id });
  mocks.get.mockResolvedValue({ id });
  mocks.list.mockResolvedValue([{ id }]);
  mocks.publish.mockResolvedValue({ id });
  mocks.decision.mockResolvedValue({ id });
});
describe("plan HTTP boundaries", () => {
  it("rejects cross-origin and non-JSON mutations before persisting", async () => {
    const { POST } = await import("@/app/api/plans/route");
    for (const [headers, status] of [
      [
        { "content-type": "application/json", origin: "https://other.example" },
        403,
      ],
      [{ "content-type": "text/plain" }, 400],
    ] as const) {
      const response = await POST(
        new Request("http://localhost/api/plans", {
          method: "POST",
          headers,
          body: JSON.stringify({ planningNight: "2026-08-03" }),
        }),
      );
      expect(response.status).toBe(status);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("uses the browser Host when Next normalizes the internal request hostname", async () => {
    const { POST } = await import("@/app/api/plans/route");
    const response = await POST(
      new Request("http://localhost:3000/api/plans", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
        },
        body: JSON.stringify({ planningNight: "2026-08-03" }),
      }),
    );
    expect(response.status).toBe(201);
  });
  it("preserves origin scheme/port and rejects forged forwarded hosts or malformed authorities", async () => {
    const { POST } = await import("@/app/api/plans/route");
    const invalidHeaders: Record<string, string>[] = [
      {
        host: "127.0.0.1:3000",
        origin: "http://evil.example:3000",
        "x-forwarded-host": "evil.example:3000",
      },
      { host: "127.0.0.1:3000", origin: "https://127.0.0.1:3000" },
      { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3001" },
      { host: "127.0.0.1:3000", origin: "null" },
      { host: "127.0.0.1:3000", origin: "not-an-origin" },
      { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000/path" },
      { host: "user@127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      { host: "127.0.0.1:3000/path", origin: "http://127.0.0.1:3000" },
      { host: "127.0.0.1:3000,evil.example", origin: "http://127.0.0.1:3000" },
    ];
    for (const headers of invalidHeaders) {
      const response = await POST(
        new Request("http://localhost:3000/api/plans", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({ planningNight: "2026-08-03" }),
        }),
      );
      expect(response.status).toBe(403);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("creates only bounded server-generation parameters", async () => {
    const { POST } = await import("@/app/api/plans/route");
    expect((await POST(request({ planningNight: "2026-08-03" }))).status).toBe(
      201,
    );
    expect(mocks.create).toHaveBeenCalledWith(
      { id: "verified" },
      { planningNight: "2026-08-03", strategy: "balanced", locked: [] },
    );
    expect(
      (await POST(request({ planningNight: "2026-08-03", metrics: {} })))
        .status,
    ).toBe(400);
  });
  it("denies anonymous/contractor/unavailable auth before reading body", async () => {
    const { POST } = await import("@/app/api/plans/route");
    for (const [code, status] of [
      ["unauthenticated", 401],
      ["forbidden", 403],
      ["auth_unavailable", 503],
    ] as const) {
      mocks.auth.mockRejectedValueOnce(new AuthError(code));
      expect((await POST(request({}))).status).toBe(status);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects malformed and oversized streamed bodies", async () => {
    const { POST } = await import("@/app/api/plans/route");
    expect(
      (
        await POST(
          new Request("http://localhost/api/plans", {
            method: "POST",
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect((await POST(request({ text: "x".repeat(65536) }))).status).toBe(413);
  });
  it("validates identifiers and list night", async () => {
    const { GET } = await import("@/app/api/plans/[id]/route");
    expect(
      (await GET(request({}), { params: Promise.resolve({ id: "bad" }) }))
        .status,
    ).toBe(400);
    expect((await GET(request({}), context)).status).toBe(200);
    const list = await import("@/app/api/plans/route");
    expect(
      (
        await list.GET(
          new Request("http://localhost/api/plans?planningNight=2026-08-03"),
        )
      ).status,
    ).toBe(200);
    expect(
      (await list.GET(new Request("http://localhost/api/plans"))).status,
    ).toBe(400);
  });
  it("returns typed stale/not-found/invalid-plan errors and no raw internals", async () => {
    const { POST } = await import("@/app/api/plans/[id]/publish/route");
    for (const [code, status] of [
      ["stale_plan", 409],
      ["not_found", 404],
      ["invalid_plan", 409],
    ] as const) {
      mocks.publish.mockRejectedValueOnce(new PlanError(code, "safe message"));
      const response = await POST(request({}), context);
      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(code);
    }
    mocks.publish.mockRejectedValueOnce(new Error("DATABASE_URL secret"));
    const response = await POST(request({}), context);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
  it("requires planner publish permission and accepts bounded decisions", async () => {
    const pub = await import("@/app/api/plans/[id]/publish/route");
    expect((await pub.POST(request({}), context)).status).toBe(200);
    expect(mocks.auth).toHaveBeenCalledWith("publish");
    const { POST } = await import("@/app/api/plans/[id]/decisions/route");
    expect(
      (await POST(request({ kind: "note", reason: "checked" }), context))
        .status,
    ).toBe(201);
    expect(
      (await POST(request({ kind: "note", reason: " " }), context)).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({ kind: "note", reason: "ok", createdBy: "forged" }),
          context,
        )
      ).status,
    ).toBe(400);
  });
});
