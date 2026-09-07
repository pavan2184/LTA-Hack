// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/permissions";
import { PlanError } from "@/lib/plans/input";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireActor: mocks.auth }));
vi.mock("@/lib/exports/service", () => ({ getPlanExport: mocks.get }));
const id = "fd8d3e80-c056-4ab2-a6b4-2f76c569b665",
  context = { params: Promise.resolve({ id }) };
const req = (query = "?format=json") =>
  new Request(`https://example.test/api/plans/${id}/export${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    identity: { id: "verified" },
    actor: { role: "planner" },
  });
  mocks.get.mockResolvedValue({
    exportVersion: 1,
    notice: "Non-operational prototype",
    assessment: { publicationState: "draft" },
    provenance: { planId: id },
    parameters: {},
    placements: [],
    deferrals: [],
    metrics: {},
    objectives: [],
    validation: { violations: [] },
    facts: {},
  });
});
describe("saved export HTTP", () => {
  it("denies anonymous and contractor access before exporting saved content", async () => {
    const { GET } = await import("@/app/api/plans/[id]/export/route");
    for (const code of ["unauthenticated", "forbidden"] as const) {
      mocks.auth.mockRejectedValue(new AuthError(code));
      expect((await GET(req(), context)).status).toBe(
        code === "unauthenticated" ? 401 : 403,
      );
    }
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("rejects invalid IDs and nonexact formats without leaking saved content", async () => {
    const { GET } = await import("@/app/api/plans/[id]/export/route");
    for (const query of [
      "",
      "?format=pdf",
      "?format=json&format=csv",
      "?format=csv&token=bad",
    ]) {
      expect((await GET(req(query), context)).status).toBe(400);
    }
    expect(
      (
        await GET(req(), {
          params: Promise.resolve({ id: "../bad\r\nheader" }),
        })
      ).status,
    ).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(["json", "csv"])(
    "returns %s file bytes with a UUID filename and private download headers",
    async (format) => {
      const { GET } = await import("@/app/api/plans/[id]/export/route");
      const response = await GET(req(`?format=${format}`), context);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toBe(
        `attachment; filename="railplan-${id}.${format}"`,
      );
      expect(response.headers.get("content-type")).toBe(
        format === "json"
          ? "application/json; charset=utf-8"
          : "text/csv; charset=utf-8",
      );
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      const text = await response.text();
      expect(text).toContain("Non-operational prototype");
      if (format === "json")
        expect(JSON.parse(text).provenance.planId).toBe(id);
      expect(mocks.get).toHaveBeenCalledWith({ id: "verified" }, id);
    },
  );
  it("returns typed missing/storage errors without internal rows or credentials", async () => {
    const { GET } = await import("@/app/api/plans/[id]/export/route");
    mocks.get.mockRejectedValueOnce(
      new PlanError("not_found", "This saved plan does not exist."),
    );
    expect((await GET(req(), context)).status).toBe(404);
    mocks.get.mockRejectedValueOnce(new Error("secret database URL"));
    const response = await GET(req(), context);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
