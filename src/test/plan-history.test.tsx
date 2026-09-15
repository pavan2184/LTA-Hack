import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PlanHistory } from "@/components/plans/PlanHistory";
import { plannerOverview, plannerVersion } from "./fixtures/planner-workspace";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("opens exact saved versions and exposes an older current publication independently of pagination", async () => {
  const version = plannerVersion();
  const current = plannerVersion({ id: "6c494154-2b92-4890-8b8a-8a522254fe43", publishState: "published" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(plannerOverview([version], { currentPublication: current }))));
  render(<PlanHistory night={version.planningNight} requestId="M-001" />);
  expect(await screen.findByRole("link", { name: /Open version/ })).toHaveAttribute("href", `/plans?night=${version.planningNight}&plan=${version.id}&request=M-001`);
  expect(screen.getByRole("link", { name: /Open current publication/ })).toHaveAttribute("href", `/plans?night=${version.planningNight}&plan=${current.id}&request=M-001`);
});
it("retains loaded versions when loading earlier history fails and allows retry", async () => {
  let calls = 0;
  vi.stubGlobal("fetch", vi.fn(async () => ++calls === 1 ? Response.json(plannerOverview([plannerVersion()], { nextCursor: "older" })) : Response.json({ error: { message: "History unavailable" } }, { status: 503 })));
  render(<PlanHistory />);
  await screen.findByRole("link", { name: /Open version/ });
  await userEvent.click(screen.getByRole("button", { name: "Load earlier versions" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("History unavailable");
  expect(screen.getByRole("link", { name: /Open version/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Load earlier versions" })).toBeEnabled();
});
