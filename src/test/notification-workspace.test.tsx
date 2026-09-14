import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SavedPlansWorkspace } from "@/components/plans/SavedPlansWorkspace";
const saved = {
  id: "plan-1",
  planningNight: "2026-09-16",
  sourceRevision: "1",
  inputDigest: "sha256:test",
  strategy: "balanced",
  solverVersion: "test",
  constraintVersion: "test",
  status: "FEASIBLE",
  objectives: [],
  metrics: {},
  validation: { independentlyValidated: true, violations: [] },
  placements: [],
  deferred: [],
  createdBy: "planner",
  createdAt: "2026-09-07T00:00:00Z",
  publishState: "draft",
  publishedAt: null,
  supersededBy: null,
};
afterEach(() => vi.unstubAllGlobals());
it("loads notification results after publication while retaining publication success when Telegram fails", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.startsWith("/api/plans?"))
        return Response.json({ plans: [saved] });
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
  await user.click(
    await screen.findByRole("button", { name: "Open version plan-1" }),
  );
  expect(calls.some((url) => url.endsWith("/notifications"))).toBe(false);
  await user.click(
    screen.getByRole("button", { name: "Publish this version" }),
  );
  expect(await screen.findByText("Plan published.")).toBeInTheDocument();
  const deliveries = await screen.findByRole("region", {
    name: "Plan notification deliveries",
  });
  expect(
    await within(deliveries).findByText("Telegram bot is not configured."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Publish this version" }),
  ).toBeDisabled();
  expect(calls.filter((url) => url.endsWith("/notifications"))).toEqual([
    "/api/plans/plan-1/notifications",
  ]);
});
it("loads destination settings only when the planner opens them", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      return Response.json(
        url.includes("configurations")
          ? { configurations: [], botConfigured: false }
          : { plans: [] },
      );
    }),
  );
  render(<SavedPlansWorkspace />);
  await screen.findByText("No saved versions for this night.");
  expect(calls).toHaveLength(1);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Notification settings" }));
  expect(
    await screen.findByText(/Bot credentials are not configured/),
  ).toBeInTheDocument();
  expect(calls).toContain("/api/notifications/configurations");
});

it("keeps a committed publication successful while showing a notification-storage warning", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("/api/plans?"))
        return Response.json({ plans: [saved] });
      if (url.endsWith("/notifications"))
        return Response.json({ deliveries: [] });
      if (url.endsWith("/publish"))
        return Response.json({
          plan: {
            ...saved,
            publishState: "published",
            publishedAt: saved.createdAt,
          },
          notificationsWarning:
            "Notification records could not be prepared. Publication is committed.",
        });
      return Response.json({ plan: saved });
    }),
  );
  const user = userEvent.setup();
  render(<SavedPlansWorkspace />);
  await user.click(
    await screen.findByRole("button", { name: "Open version plan-1" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Publish this version" }),
  );
  expect(await screen.findByText("Plan published.")).toBeInTheDocument();
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

it('preserves unsaved destination edits when the schedule is refreshed or the night changes', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(
    url.includes('configurations') ? { configurations: [{ organisationId: 'org', organisationName: 'Alpha', chatId: null, version: 0, updatedAt: null, updatedBy: null, lastTest: null }], botConfigured: false }
      : url.startsWith('/api/plans?') ? { plans: [saved] } : { plan: saved })));
  render(<SavedPlansWorkspace />);
  await screen.findByText(`Schedule for ${saved.planningNight}`);
  await userEvent.click(screen.getByText('Contractor delivery settings'));
  await userEvent.click(screen.getByRole('button', { name: 'Notification settings' }));
  await userEvent.type(await screen.findByLabelText('Telegram chat ID'), '-100123');
  await userEvent.click(screen.getByText(/^Version history/));
  await userEvent.click(screen.getByRole('button', { name: 'Refresh versions' }));
  await screen.findByText(`Schedule for ${saved.planningNight}`);
  expect(screen.getByLabelText('Telegram chat ID')).toHaveValue('-100123');
  await userEvent.clear(screen.getByLabelText('Planning night'));
  expect(screen.getByLabelText('Telegram chat ID')).toHaveValue('-100123');
});
