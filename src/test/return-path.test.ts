import { expect, it } from "vitest";
import { safeReturnTo } from "@/lib/auth/return-path";
it("restores planner request creation without accepting form or organisation data", () => {
  expect(safeReturnTo("/requests?request=new&planningNight=2026-09-16&plan=version-1&organisationId=other&title=private", "planner"))
    .toBe("/requests?request=new&planningNight=2026-09-16&plan=version-1");
});

it("retains navigation context but never arbitrary form contents", () => {
  expect(safeReturnTo("/requests/drafts?draft=abc&transcript=private&planningNight=2026-09-16", "planner")).toBe("/requests/drafts?draft=abc&planningNight=2026-09-16");
});
it("restores an exact planner coordination case without retaining form notes", () => {
  expect(safeReturnTo("/plans/coordination?case=abc-123&night=2026-09-16&plan=version-1&note=private", "planner")).toBe("/plans/coordination?case=abc-123&night=2026-09-16&plan=version-1");
});
it.each(["https://evil.example/plans", "//evil.example", "/\\evil.example", "/%2f%2fevil.example", "/api/plans", "/login", "/plans/../api/plans", "/plans\n"])('rejects unsafe or non-workspace return path %s', (value) => {
  expect(safeReturnTo(value, "planner")).toBe("/plans");
});
it("does not send contractors to planner-only destinations", () => {
  expect(safeReturnTo("/plans?night=2026-09-16", "contractor")).toBe("/contractor");
  expect(safeReturnTo("/plans/coordination?case=abc", "contractor")).toBe("/contractor");
  expect(safeReturnTo("/contractor/drafts?draft=abc", "contractor")).toBe("/contractor/drafts?draft=abc");
});
