// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
import { REQUEST_FIELD_KEYS } from "@railplan/core/types/ingestions";
import { AuthError } from "@/lib/auth/permissions";
import { RequestError } from "@/lib/requests/service";
const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireActor: mock.auth }));
vi.mock("@/lib/ingestions/service", () => ({
  getPrivateDraft: mock.get,
  updatePrivateDraft: mock.update,
  submitPrivateDraft: mock.submit,
}));
const context = {
  params: Promise.resolve({ id: "27bec1a4-58dd-431b-a42b-a61f91fb7f1e" }),
};
const fields = Object.fromEntries(REQUEST_FIELD_KEYS.map((k) => [k, null]));
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/ingestions/drafts/id", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mock.auth.mockResolvedValue({
    identity: { id: "owner" },
    actor: { role: "contractor" },
  });
  mock.get.mockResolvedValue({ id: "draft", revisions: [] });
  mock.update.mockResolvedValue({ id: "draft", version: 2 });
  mock.submit.mockResolvedValue({
    draft: { id: "draft", status: "submitted" },
    request: { id: "request" },
  });
});
describe("owner private draft review HTTP boundaries", () => {
  it("rejects anonymous or cross-origin edits before accepting mutable content", async () => {
    const { PATCH } = await import("@/app/api/ingestions/drafts/[id]/route");
    mock.auth.mockRejectedValueOnce(new AuthError("unauthenticated"));
    expect((await PATCH(request({}), context)).status).toBe(401);
    expect(
      (
        await PATCH(
          request(
            { expectedVersion: 1, fields, reason: "Edit" },
            { origin: "https://other.example" },
          ),
          context,
        )
      ).status,
    ).toBe(403);
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("rejects forged provenance and optimistic versions while returning normalized missing fields", async () => {
    const { PATCH } = await import("@/app/api/ingestions/drafts/[id]/route");
    for (const extra of [
      { evidence: [] },
      { confidence: {} },
      { ownerId: "other" },
      { expectedVersion: 0 },
    ])
      expect(
        (
          await PATCH(
            request({ expectedVersion: 1, fields, reason: "Edit", ...extra }),
            context,
          )
        ).status,
      ).toBe(400);
    const result = await PATCH(
      request({
        expectedVersion: 1,
        fields: { ...fields, title: "   " },
        reason: "Clarify",
      }),
      context,
    );
    expect(result.status).toBe(200);
    expect(mock.update).toHaveBeenCalledWith(
      { id: "owner" },
      (await context.params).id,
      { expectedVersion: 1, fields, reason: "Clarify" },
    );
  });
  it("returns full private history only from owned detail and preserves conflicts on submission", async () => {
    const { GET } = await import("@/app/api/ingestions/drafts/[id]/route");
    const { POST } = await import(
      "@/app/api/ingestions/drafts/[id]/submit/route"
    );
    expect(await (await GET(request({}), context)).json()).toEqual({
      draft: { id: "draft", revisions: [] },
    });
    mock.submit.mockRejectedValueOnce(new RequestError("conflict", "Reload"));
    expect(
      (
        await POST(
          request({ expectedVersion: 1, reason: "Share fields and evidence" }),
          context,
        )
      ).status,
    ).toBe(409);
    const response = await POST(
      request({ expectedVersion: 1, reason: "Share fields and evidence" }),
      context,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      draft: { status: "submitted" },
      request: { id: "request" },
    });
  });
});
