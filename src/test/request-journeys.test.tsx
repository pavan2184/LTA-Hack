import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RequestWorkspaces } from "@/components/requests/RequestWorkspaces";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("separates review and private extraction routes while retaining planner context", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ requests: [], catalogue: { nights: [] } })));
  render(<RequestWorkspaces role="planner" planningNight="2026-09-16" planId="plan-1" planRequestId="M-014" />);
  expect(screen.queryByLabelText("Meeting transcript")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Private transcript drafts" })).toHaveAttribute("href", "/requests/drafts?planningNight=2026-09-16&plan=plan-1&planRequest=M-014");
  expect(screen.getByRole("link", { name: "Back to night overview" })).toHaveAttribute("href", "/plans?night=2026-09-16&plan=plan-1&request=M-014");
  await screen.findByText("No requests yet.");
});
