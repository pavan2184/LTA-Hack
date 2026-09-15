// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/permissions";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  analyse: vi.fn(),
  overview: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireActor: mocks.auth }));
vi.mock("@/lib/plans/analysis", () => ({ analysePlan: mocks.analyse }));
vi.mock("@/lib/plans/overview", async (original) => ({
  ...(await original<typeof import("@/lib/plans/overview")>()),
  getPlannerOverview: mocks.overview,
}));
import { POST } from "@/app/api/plans/[id]/analysis/route";
import { GET } from "@/app/api/plans/overview/route";
const context = {
  params: Promise.resolve({ id: "fd8d3e80-c056-4ab2-a6b4-2f76c569b665" }),
};
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/plans/id/analysis", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ identity: { id: "verified" } });
  mocks.analyse.mockResolvedValue({ operation: "preview" });
  mocks.overview.mockResolvedValue({ versions: [] });
});
it("authenticates both routes before processing any input", async () => {
  for (const [code, status] of [
    ["unauthenticated", 401],
    ["forbidden", 403],
    ["auth_unavailable", 503],
  ] as const) {
    mocks.auth.mockRejectedValueOnce(new AuthError(code));
    expect((await POST(request({}), context)).status).toBe(status);
    mocks.auth.mockRejectedValueOnce(new AuthError(code));
    expect((await GET(new Request("http://localhost/?bad=true"))).status).toBe(
      status,
    );
  }
  expect(mocks.analyse).not.toHaveBeenCalled();
  expect(mocks.overview).not.toHaveBeenCalled();
});
it("requires same-origin bounded strict JSON and valid plan ids", async () => {
  expect(
    (
      await POST(
        request(
          { operation: "preview", strategy: "balanced" },
          { origin: "https://foreign.example" },
        ),
        context,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await POST(
        request(
          { operation: "preview", strategy: "balanced" },
          { "content-type": "text/plain" },
        ),
        context,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({ operation: "preview", strategy: "balanced", result: {} }),
        context,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({ text: "x".repeat(65536) }, { "content-length": "1" }),
        context,
      )
    ).status,
  ).toBe(413);
  expect(
    (
      await POST(request({ operation: "compare-objectives" }), {
        params: Promise.resolve({ id: "bad" }),
      })
    ).status,
  ).toBe(400);
  expect(mocks.analyse).not.toHaveBeenCalled();
});
it("returns no-store contracts and safely hides service errors", async () => {
  const response = await POST(
    request({ operation: "preview", strategy: "balanced" }),
    context,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ operation: "preview" });
  expect(await (await GET(new Request("http://localhost/"))).json()).toEqual({
    overview: { versions: [] },
  });
  expect(
    (await GET(new Request("http://localhost/?cursor=a&cursor=b"))).status,
  ).toBe(400);
  mocks.analyse.mockRejectedValueOnce(new Error("DATABASE_URL secret"));
  const failure = await POST(
    request({ operation: "compare-objectives" }),
    context,
  );
  expect(failure.status).toBe(500);
  expect(JSON.stringify(await failure.json())).not.toContain("secret");
});
