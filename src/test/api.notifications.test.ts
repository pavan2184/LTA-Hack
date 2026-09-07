// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/permissions";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  configure: vi.fn(),
  test: vi.fn(),
  deliveries: vi.fn(),
  retry: vi.fn(),
  publish: vi.fn(),
  dispatch: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireActor: mocks.auth }));
vi.mock("@/lib/notifications/service", async (original) => ({
  ...(await original<typeof import("@/lib/notifications/service")>()),
  listNotificationConfigurations: mocks.list,
  configureNotification: mocks.configure,
  testNotificationConfiguration: mocks.test,
  listPlanNotifications: mocks.deliveries,
  retryNotification: mocks.retry,
  dispatchPlanNotifications: mocks.dispatch,
}));
vi.mock("@/lib/plans/service", () => ({ publishPlan: mocks.publish }));
const id = "fd8d3e80-c056-4ab2-a6b4-2f76c569b665";
const context = { params: Promise.resolve({ organisationId: id, id }) };
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost/api/notifications/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    identity: { id: "verified" },
    actor: { role: "planner" },
  });
  mocks.list.mockResolvedValue([]);
  mocks.deliveries.mockResolvedValue([]);
  mocks.configure.mockResolvedValue({
    organisationId: id,
    chatId: "123",
    version: 1,
  });
  mocks.test.mockResolvedValue({
    id,
    status: "failed",
    errorCode: "missing_credentials",
  });
  mocks.retry.mockResolvedValue({ id, status: "sent" });
  mocks.publish.mockResolvedValue({ id, publishState: "published" });
});
describe("notification HTTP boundaries", () => {
  it("requires planner authentication before processing every route", async () => {
    const { GET: list } = await import(
      "@/app/api/notifications/configurations/route"
    );
    const { PUT } = await import(
      "@/app/api/notifications/configurations/[organisationId]/route"
    );
    const { POST: test } = await import(
      "@/app/api/notifications/configurations/[organisationId]/test/route"
    );
    const { GET: deliveries } = await import(
      "@/app/api/plans/[id]/notifications/route"
    );
    const { POST: retry } = await import(
      "@/app/api/notifications/[id]/retry/route"
    );
    for (const code of ["unauthenticated", "forbidden"] as const) {
      mocks.auth.mockRejectedValue(new AuthError(code));
      const responses = await Promise.all([
        list(),
        PUT(req({}), context),
        test(req({}), context),
        deliveries(req({}), context),
        retry(req({}), context),
      ]);
      expect(
        responses.every(
          (r) => r.status === (code === "unauthenticated" ? 401 : 403),
        ),
      ).toBe(true);
    }
    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.retry).not.toHaveBeenCalled();
  });
  it("rejects cross-origin, invalid destinations, unsupported body fields and oversized streamed JSON", async () => {
    const { PUT } = await import(
      "@/app/api/notifications/configurations/[organisationId]/route"
    );
    const { POST: retry } = await import(
      "@/app/api/notifications/[id]/retry/route"
    );
    expect(
      (
        await PUT(
          req(
            { expectedVersion: 0, chatId: "123" },
            { origin: "https://evil.example" },
          ),
          context,
        )
      ).status,
    ).toBe(403);
    expect(
      (await PUT(req({ expectedVersion: 0, chatId: "@channel" }), context))
        .status,
    ).toBe(400);
    expect((await retry(req({ chatId: "999" }), context)).status).toBe(400);
    const oversized = new Request(`http://localhost/api/notifications/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "content-length": "2" },
      body: JSON.stringify({ padding: "x".repeat(65536) }),
    });
    expect((await PUT(oversized, context)).status).toBe(413);
    expect(mocks.configure).not.toHaveBeenCalled();
  });
  it("returns no-store typed delivery failures without claiming a provider success", async () => {
    const { POST } = await import(
      "@/app/api/notifications/configurations/[organisationId]/test/route"
    );
    const response = await POST(req({ expectedVersion: 1 }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      delivery: { id, status: "failed", errorCode: "missing_credentials" },
    });
    expect(mocks.test).toHaveBeenCalledWith({ id: "verified" }, id, {
      expectedVersion: 1,
    });
  });
  it("maps retry conflicts and storage exceptions without exposing token-bearing upstream errors", async () => {
    const { NotificationError } = await import("@/lib/notifications/service");
    const { POST } = await import("@/app/api/notifications/[id]/retry/route");
    mocks.retry.mockRejectedValueOnce(new NotificationError("duplicate_risk"));
    expect((await POST(req({}), context)).status).toBe(409);
    mocks.retry.mockRejectedValueOnce(
      new Error("https://api.telegram.org/botSECRET/request"),
    );
    const failed = await POST(req({}), context);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("SECRET");
  });
  it("retains successful publication when post-commit delivery storage fails", async () => {
    const { POST } = await import("@/app/api/plans/[id]/publish/route");
    mocks.dispatch.mockRejectedValue(
      new Error("private database error and token"),
    );
    const response = await POST(req({}), context),
      body = await response.json();
    expect(response.status).toBe(200);
    expect(body.plan.publishState).toBe("published");
    expect(body.notificationsWarning).toMatch(/published/i);
    expect(JSON.stringify(body)).not.toContain("token");
    expect(mocks.publish.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.dispatch.mock.invocationCallOrder[0],
    );
  });
});
