// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
import { AuthError } from "@/lib/auth/permissions";
import { IngestionError } from "@/lib/ingestions/errors";
const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  extract: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireActor: mock.auth }));
vi.mock("@/lib/ingestions/service", () => ({
  extractAndSaveDrafts: mock.extract,
  listPrivateDrafts: mock.list,
}));
const request = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/ingestions/transcript", {
    method: "POST",
    headers: { "content-type": "text/plain; charset=utf-8", ...headers },
    body,
  });
beforeEach(() => {
  vi.resetAllMocks();
  mock.auth.mockResolvedValue({
    identity: { id: "owner" },
    actor: { role: "contractor" },
  });
  mock.extract.mockResolvedValue([{ id: "private" }]);
  mock.list.mockResolvedValue([{ id: "private" }]);
});
describe("transcript HTTP boundary", () => {
  it("authenticates before reading content and rejects cross-origin, invalid encoding and oversized text", async () => {
    const { POST } = await import("@/app/api/ingestions/transcript/route");
    mock.auth.mockRejectedValueOnce(new AuthError("unauthenticated"));
    expect((await POST(request(new Uint8Array([0xff])))).status).toBe(401);
    expect(
      (await POST(request("private text", { origin: "https://evil.example" })))
        .status,
    ).toBe(403);
    expect((await POST(request(new Uint8Array([0xff])))).status).toBe(400);
    expect((await POST(request("x".repeat(65537)))).status).toBe(413);
    expect((await POST(request("  "))).status).toBe(400);
    expect(mock.extract).not.toHaveBeenCalled();
  });
  it("returns safe typed model errors and quota retry headers without source contents", async () => {
    const { POST } = await import("@/app/api/ingestions/transcript/route");
    for (const [code, status] of [
      ["model_refused", 422],
      ["model_timeout", 504],
      ["model_unavailable", 503],
      ["invalid_model_output", 502],
      ["invalid_evidence", 422],
      ["rate_limited", 429],
    ] as const) {
      mock.extract.mockRejectedValueOnce(
        new IngestionError(code, code === "rate_limited" ? 60 : undefined),
      );
      const response = await POST(request("SECRET FULL TRANSCRIPT"));
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).not.toContain(
        "SECRET FULL TRANSCRIPT",
      );
      if (code === "rate_limited")
        expect(response.headers.get("retry-after")).toBe("60");
    }
  });
  it("returns private saved drafts and owner-only list with no-store", async () => {
    const { POST } = await import("@/app/api/ingestions/transcript/route");
    const { GET } = await import("@/app/api/ingestions/drafts/route");
    const response = await POST(
      request("source excerpt plus private discarded context"),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ drafts: [{ id: "private" }] });
    expect(await (await GET()).json()).toEqual({ drafts: [{ id: "private" }] });
    expect(mock.extract).toHaveBeenCalledWith(
      { id: "owner" },
      "source excerpt plus private discarded context",
    );
  });
});
