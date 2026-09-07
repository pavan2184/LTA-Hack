// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canPerform, requireAction, AuthError } from "@/lib/auth/permissions";
import { readBoundedJson } from "@/lib/http/body";

describe("role action boundary", () => {
  for (const action of ["assistant", "solve", "approve", "publish", "manage_resources"] as const) {
    it(`allows only planners to ${action}`, () => {
      expect(canPerform("planner", action)).toBe(true);
      expect(canPerform("contractor", action)).toBe(false);
      expect(() => requireAction({ role: "contractor" }, action)).toThrow(AuthError);
    });
  }
});

describe("bounded streamed JSON", () => {
  it("counts actual bytes even with a dishonest Content-Length", async () => {
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('"' + "x".repeat(65536) + '"'));
      controller.close();
    }});
    const request = new Request("http://localhost", { method: "POST", body, duplex: "half", headers: { "content-length": "1" } } as RequestInit);
    await expect(readBoundedJson(request)).rejects.toMatchObject({ code: "payload_too_large" });
  });
  it("accepts bounded valid JSON and rejects malformed JSON", async () => {
    await expect(readBoundedJson(new Request("http://localhost", { method: "POST", body: '{"ok":true}' }))).resolves.toEqual({ ok: true });
    await expect(readBoundedJson(new Request("http://localhost", { method: "POST", body: '{' }))).rejects.toMatchObject({ code: "malformed_request" });
  });
});
