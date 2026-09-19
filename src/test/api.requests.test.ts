// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/permissions";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  act: vi.fn(),
  catalogue: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireActor: mocks.auth }));
vi.mock("@/lib/requests/service", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createRequest: mocks.create,
  getRequest: mocks.get,
  listRequests: mocks.list,
  updateRequest: mocks.update,
  actOnRequest: mocks.act,
  getRequestCatalogue: mocks.catalogue,
}));
const fields = {
  planningNight: "2026-08-03",
  title: "Inspect",
  description: "Inspect walkway",
  workClass: "civil",
  blockIds: ["NS10-NS11"],
  durationMinutes: 15,
  preferredStart: 0,
  earliestStart: 0,
  latestEnd: 240,
  equipment: [],
  workforce: [{ roleId: "R", count: 1 }],
};
const context = {
  params: Promise.resolve({ id: "bdf7d53e-d2d0-46c4-b8a2-c8de67911f74" }),
};
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    identity: { id: "verified" },
    actor: { role: "contractor" },
  });
  mocks.create.mockResolvedValue({ id: "saved" });
  mocks.list.mockResolvedValue([]);
  mocks.catalogue.mockResolvedValue({ roles: [] });
});
describe("request HTTP boundary", () => {
  it("passes a validated night filter to the scoped server list and preserves all-night reads", async () => {
    const { GET } = await import("@/app/api/requests/route");
    expect((await GET(new Request("http://localhost/api/requests?planningNight=2026-08-03"))).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ id: "verified" }, undefined, "2026-08-03");
    expect((await GET(new Request("http://localhost/api/requests"))).status).toBe(200);
    expect(mocks.list).toHaveBeenLastCalledWith({ id: "verified" }, undefined, undefined);
    mocks.list.mockClear();
    expect((await GET(new Request("http://localhost/api/requests?planningNight=2026-02-30"))).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("authenticates before reading malformed bodies and fails closed on outages", async () => {
    const { POST } = await import("@/app/api/requests/route");
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
  it("returns field-level schema errors and rejects caller lifecycle/identity fields", async () => {
    const { POST } = await import("@/app/api/requests/route");
    const bad = await POST(
      request({
        fields: { ...fields, workforce: [{ roleId: "R", count: 0 }] },
      }),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.fieldErrors).toHaveProperty(
      "workforce.0.count",
    );
    for (const injected of [
      { organisationId: "other" },
      { status: "approved" },
      { actorId: "other" },
    ])
      expect((await POST(request({ fields, ...injected }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires same-origin bounded JSON and exposes private successful envelopes", async () => {
    const { POST, GET } = await import("@/app/api/requests/route");
    expect(
      (await POST(request({ fields }, { origin: "https://other.example" })))
        .status,
    ).toBe(403);
    expect(
      (await POST(request({ fields }, { "content-type": "text/plain" })))
        .status,
    ).toBe(400);
    expect((await POST(request({ text: "x".repeat(65536) }))).status).toBe(413);
    const saved = await POST(request({ fields }));
    expect(saved.status).toBe(201);
    expect(await saved.json()).toEqual({ request: { id: "saved" } });
    expect(saved.headers.get("cache-control")).toBe("no-store");
    expect((await GET(new Request("http://localhost/api/requests"))).status).toBe(200);
  });
  it("requires a current version and planner confirmation before approval", async () => {
    const { POST } = await import("@/app/api/requests/[id]/actions/route");
    const body = {
      expectedVersion: 1,
      action: "approve",
      reason: "Reviewed",
      approval: {
        teamId: "T",
        priority: "low",
        clearanceMinutes: 0,
        requiredSkills: [],
        dependencies: [],
        dependencyLagMinutes: 0,
        safetyConfirmed: false,
      },
    };
    const result = await POST(request(body), context);
    expect(result.status).toBe(400);
    expect((await result.json()).error.fieldErrors).toHaveProperty(
      "approval.safetyConfirmed",
    );
    expect(
      (
        await POST(
          request({ expectedVersion: 0, action: "cancel", reason: "Withdraw" }),
          context,
        )
      ).status,
    ).toBe(400);
    expect(mocks.act).not.toHaveBeenCalled();
  });
});
