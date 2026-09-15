import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { plannerExport, plannerInspection, plannerOverview, plannerVersion } from "./fixtures/planner-workspace";
import { SavedPlansWorkspace } from "@/components/plans/SavedPlansWorkspace";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";
const saved = plannerVersion({ id: "plan-1" });
beforeEach(() => window.history.replaceState(null, "", "/plans"));
afterEach(() => vi.unstubAllGlobals());
it("loads notification results after publication while retaining publication success when Telegram fails", async () => {
  const calls: string[] = [];
  let published = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/analysis")) return plannerInspection(url, init);
      calls.push(url);
      if (url.startsWith("/api/plans/overview"))
        return Response.json(plannerOverview([saved]));
      if (url.endsWith("/notifications"))
        return Response.json({
          deliveries: [
            {
              id: "d1",
              organisationId: "org",
              organisationName: "Alpha",
              planId: saved.id,
              planningNight: saved.planningNight,
              kind: "publication",
              messageText: "Scoped Alpha message",
              deduplicationKey: "plan-1:org",
              status: "failed",
              ambiguous: false,
              inFlight: false,
              attemptCount: 1,
              telegramMessageId: null,
              errorCode: "missing_credentials",
              errorMessage: "Telegram bot is not configured.",
              nextRetryAt: null,
              createdAt: saved.createdAt,
              lastAttemptAt: saved.createdAt,
              sentAt: null,
              attempts: [],
            },
          ],
        });
      if (url.includes("/export?")) return Response.json(plannerExport(published ? { ...saved, publishState: "published", publishedAt: saved.createdAt } : saved));
      if (url.endsWith("/publish")) published = true;
      return Response.json({
        plan: url.endsWith("/publish")
          ? {
              ...saved,
              publishState: "published",
              publishedAt: saved.createdAt,
            }
          : saved,
      });
    }),
  );
  const user = userEvent.setup();
  render(<SavedPlansWorkspace />);
  await screen.findByRole("button", { name: "Version details" });
  await user.click(screen.getByRole("button", { name: "Review publication" }));
  expect(calls.some((url) => url.endsWith("/notifications"))).toBe(false);
  await user.click(
    screen.getByRole("button", { name: "Publish this version" }),
  );
  expect(await within(screen.getByRole("dialog")).findByText(`Plan published (${saved.id}). Notification delivery is shown separately.`)).toBeInTheDocument();
  const deliveries = await screen.findByRole("region", {
    name: "Plan notification deliveries",
  });
  expect(
    await within(deliveries).findByText("Telegram bot is not configured."),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "Current publication" })).toBeDisabled();
  expect(calls.filter((url) => url.endsWith("/notifications"))).toEqual([
    "/api/plans/plan-1/notifications",
  ]);
});
it("links to the dedicated settings view without loading destinations into the plan workspace", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/analysis")) return plannerInspection(url, init);
      calls.push(url);
      return Response.json(
        url.includes("configurations")
          ? { configurations: [], botConfigured: false }
          : plannerOverview(),
      );
    }),
  );
  const workspace = render(<SavedPlansWorkspace />);
  await screen.findByText("No saved versions for this night.");
  expect(calls).toHaveLength(1);
  expect(within(screen.getByRole("banner")).getByRole("link", { name: "Notification settings" })).toHaveAttribute("href", "/settings/notifications?night=2026-09-16");
  workspace.unmount();
  render(<NotificationSettings />);
  expect(
    await screen.findByText(/Bot credentials are not configured/),
  ).toBeInTheDocument();
  expect(calls).toContain("/api/notifications/configurations");
});

it("keeps a committed publication successful while showing a notification-storage warning", async () => {
  let published = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/analysis")) return plannerInspection(url, init);
      if (url.startsWith("/api/plans/overview"))
        return Response.json(plannerOverview([saved]));
      if (url.endsWith("/notifications"))
        return Response.json({ deliveries: [] });
      if (url.endsWith("/publish")) {
        published = true;
        return Response.json({
          plan: {
            ...saved,
            publishState: "published",
            publishedAt: saved.createdAt,
          },
          notificationsWarning:
            "Notification records could not be prepared. Publication is committed.",
        });
      }
      return Response.json(plannerExport(published ? { ...saved, publishState: "published", publishedAt: saved.createdAt } : saved));
    }),
  );
  const user = userEvent.setup();
  render(<SavedPlansWorkspace />);
  await screen.findByRole("button", { name: "Version details" });
  await user.click(screen.getByRole("button", { name: "Review publication" }));
  await user.click(
    screen.getByRole("button", { name: "Publish this version" }),
  );
  expect(await within(screen.getByRole("dialog")).findByText(`Plan published (${saved.id}). Notification delivery is shown separately.`)).toBeInTheDocument();
  expect(
    await screen.findByText(
      "Notification records could not be prepared. Publication is committed.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(/There were no affected contractor organisations/),
  ).not.toBeInTheDocument();
});

// Saved snapshot visuals have real-component and combined journey coverage.
vi.mock("@/components/plans/SavedPlanReview", () => ({ SavedPlanReview: () => null }));

it("protects destination edits on the dedicated settings page before reload or return to a night", async () => {
  window.history.replaceState(null, "", "/settings/notifications");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
    configurations: [{ organisationId: "org", organisationName: "Alpha", chatId: null, version: 0, updatedAt: null, updatedBy: null, lastTest: null }], botConfigured: false,
  })));
  const confirm = vi.fn(() => false);
  vi.stubGlobal("confirm", confirm);
  render(<><a href="/plans?night=2026-09-16">Back to night overview</a><NotificationSettings /></>);
  await userEvent.type(await screen.findByLabelText("Telegram chat ID"), "-100123");
  await userEvent.click(screen.getByRole("button", { name: "Reload settings (discard unsaved edits)" }));
  expect(screen.getByLabelText("Telegram chat ID")).toHaveValue("-100123");
  await userEvent.click(screen.getByRole("link", { name: "Back to night overview" }));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText("Telegram chat ID")).toHaveValue("-100123");
  expect(window.location.pathname).toBe("/settings/notifications");
});
