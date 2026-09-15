// @vitest-environment node
import { expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "@/proxy";
it.each([
  "/",
  "/login",
  "/contractor",
  "/contractor/drafts",
  "/requests/drafts",
  "/plans/history",
  "/settings/notifications",
  "/requests",
  "/plans",
  "/sandbox",
  "/sandbox/nested",
  "/api/plans",
])("refreshes sessions on protected workspace %s", (url) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
});
it("does not invoke auth refresh for static assets", () => {
  expect(
    unstable_doesMiddlewareMatch({
      config,
      url: "/_next/static/chunks/example.js",
    }),
  ).toBe(false);
});
