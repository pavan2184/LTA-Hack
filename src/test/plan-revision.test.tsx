import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlannerConflictReview } from "@/components/plans/PlannerConflictReview";
import { SavedPlansWorkspace } from "@/components/plans/SavedPlansWorkspace";
import { groupConflicts } from "@railplan/core/engine/conflicts";
import { reviewSubmittedPlan } from "@railplan/core/engine/solve";
import { plannerExport, plannerInspection, plannerOverview, plannerVersion, plannerResult } from "./fixtures/planner-workspace";

const groups = groupConflicts(reviewSubmittedPlan().violations);
beforeEach(() => { window.history.replaceState(null, "", "/plans"); localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("reveals every finding in a clash and delegates only its ID for a server repair", async () => {
  const repair = vi.fn(), select = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ operation: "conflicts", groups, stale: false })));
  render(<PlannerConflictReview planId="test" strategy="balanced" locked={[]} disabled={false} onRepair={repair} onSelectRequest={select} />);
  await userEvent.click(screen.getByRole("button", { name: "Review requested-time conflicts" }));
  await screen.findByText(/clashes ·/);
  const group = groups.find(g => g.violations.length > 1)!;
  const summary = screen.getByText(group.requestIds.join(" / ") + " · " + group.primary.title, { selector: "summary" });
  await userEvent.click(summary);
  const panel = within(summary.parentElement!);
  for (const finding of group.violations) expect(panel.getByText(finding.detail, { exact: false })).toBeInTheDocument();
  await userEvent.click(panel.getAllByRole("button", { name: /Preview repair/ })[0]);
  expect(repair).toHaveBeenCalledWith(group.violations[0].id);
  await userEvent.click(panel.getByRole("button", { name: "Inspect " + group.requestIds[0] }));
  expect(select).toHaveBeenCalledWith(group.requestIds[0]);
});
it("keeps stale conflict evidence readable but blocks repairs", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ operation: "conflicts", groups: [groups[0]], stale: true })));
  render(<PlannerConflictReview planId="test" strategy="balanced" locked={[]} disabled={false} onRepair={vi.fn()} onSelectRequest={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "Review requested-time conflicts" }));
  await userEvent.click(await screen.findByText(groups[0].requestIds.join(" / ") + " · " + groups[0].primary.title, { selector: "summary" }));
  for (const button of screen.getAllByRole("button", { name: /Preview repair/ })) expect(button).toBeDisabled();
});
it("opens a guarded full-plan change preview without saving, publishing or using a client revision editor", async () => {
  const version = plannerVersion(), snapshot = plannerExport(version);
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/overview")) return Response.json(plannerOverview([version]));
    if (url.includes("/export?")) return Response.json(snapshot);
    if (url.endsWith("/analysis")) {
      const body = JSON.parse(String(init?.body));
      if (body.operation === "conflicts") return Response.json({ operation: "conflicts", groups: [groups[0]], stale: false });
      if (body.operation === "repair") return Response.json({
        operation: "preview", result: plannerResult, stale: false, currentSourceRevision: "1",
        parameters: snapshot.parameters,
        basis: { planId: version.id, sourceRevision: "1", solverVersion: plannerResult.solverVersion, constraintVersion: plannerResult.constraintVersion, inputDigest: "sha256:preview" },
      });
      return plannerInspection(url, init);
    }
    return Response.json({ cases: [], items: [], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<SavedPlansWorkspace />);
  await screen.findByText("Inputs current");
  await userEvent.click(screen.getByRole("button", { name: "Review requested-time conflicts" }));
  await userEvent.click(await screen.findByText(groups[0].requestIds.join(" / ") + " · " + groups[0].primary.title, { selector: "summary" }));
  await userEvent.click(screen.getAllByRole("button", { name: /Preview repair/ })[0]);
  await screen.findByRole("dialog");
  expect(screen.getByRole("dialog")).toHaveTextContent(/saved/i);
  expect(fetcher.mock.calls.some(([url]) => url === "/api/plans" || url.endsWith("/publish"))).toBe(false);
  const command = fetcher.mock.calls.map(([, init]) => init?.body && JSON.parse(String(init.body))).find(body => body?.operation === "repair");
  expect(Object.keys(command).sort()).toEqual(["locked", "operation", "strategy", "violationId"]);
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.getByRole("button", { name: "Review publication" })).toBeDisabled());
  await userEvent.click(screen.getByRole("button", { name: "Discard preview" }));
  expect(screen.getByRole("button", { name: "Review publication" })).toBeEnabled();
});
