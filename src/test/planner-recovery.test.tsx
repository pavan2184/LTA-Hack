import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SavedPlansWorkspace } from "@/components/plans/SavedPlansWorkspace";
import {
  plannerExport,
  plannerOverview,
  plannerResult,
  plannerVersion,
} from "./fixtures/planner-workspace";

vi.mock("@/components/plans/PlannerInspector", () => ({
  PlannerInspector: () => null,
}));
vi.mock("@/components/notifications/PlanNotifications", () => ({
  PlanNotifications: () => null,
}));
vi.mock("@/components/notifications/NotificationSettings", () => ({
  NotificationSettings: () => null,
}));
const original = plannerVersion();
const generated = plannerVersion({
  id: "a3f45ec6-2f90-4bf8-bef4-345fe52cd524",
});
beforeEach(() => window.history.replaceState(null, "", "/plans"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const ready = () => screen.findByRole("button", { name: "Version details" });

it.each(["overview", "export"] as const)(
  "retains successful generation identity when its %s refresh fails and retries that exact version",
  async (failure) => {
    let saved = false,
      failRefresh = true;
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/plans") {
        saved = true;
        return Response.json({ plan: generated }, { status: 201 });
      }
      if (url.startsWith("/api/plans/overview")) {
        if (saved && failRefresh && failure === "overview")
          throw new TypeError("network");
        return Response.json(
          plannerOverview(saved ? [generated, original] : [original]),
        );
      }
      if (url.endsWith("/export?format=json")) {
        if (saved && failRefresh && failure === "export")
          throw new TypeError("network");
        return Response.json(
          plannerExport(url.includes(generated.id) ? generated : original),
        );
      }
      throw new Error(`Unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<SavedPlansWorkspace />);
    await ready();
    await user.click(
      screen.getByRole("button", { name: "Generate revised draft" }),
    );
    const status = screen.getByRole("status", {
      name: "Plan operation status",
    });
    await waitFor(() =>
      expect(status).toHaveTextContent(
        `Plan generated and saved (${generated.id}), but its display could not be refreshed`,
      ),
    );
    expect(
      screen.queryByRole("region", { name: "Saved block Gantt" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("No saved versions for this night."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate and save plan" }),
    ).toBeDisabled();
    expect(new URL(window.location.href).searchParams.get("plan")).toBe(
      generated.id,
    );
    failRefresh = false;
    const requestsBeforeRetry = fetcher.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Refresh status" }));
    await ready();
    expect(
      fetcher.mock.calls.slice(requestsBeforeRetry).map(([url]) => url),
    ).toContain(`/api/plans/${generated.id}/export?format=json`);
    expect(
      fetcher.mock.calls.filter(([url]) => url === "/api/plans"),
    ).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "Saved block Gantt" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate revised draft" }),
    ).toBeEnabled();
  },
);

it("keeps publication outcome unconfirmed when both response and refresh fail, then recovers the exact version", async () => {
  let attempted = false,
    failRefresh = true;
  const published = plannerVersion({
    publishState: "published",
    publishedAt: original.createdAt,
  });
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("/publish")) {
      attempted = true;
      throw new TypeError("connection interrupted after send");
    }
    if (url.startsWith("/api/coordination?"))
      return Response.json({ cases: [], hasMore: false, nextCursor: null });
    if (url === "/api/requests/catalogue")
      return Response.json({ catalogue: { organisations: [] } });
    if (url.startsWith("/api/plans/overview")) {
      if (attempted && failRefresh) throw new TypeError("network");
      return Response.json(plannerOverview([attempted ? published : original]));
    }
    if (url.endsWith("/export?format=json"))
      return Response.json(plannerExport(attempted ? published : original));
    throw new Error(`Unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<SavedPlansWorkspace />);
  await ready();
  await user.click(screen.getByRole("button", { name: "Review publication" }));
  await user.click(
    screen.getByRole("button", { name: "Publish this version" }),
  );
  const dialog = screen.getByRole("dialog");
  await waitFor(() =>
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      `Publication status for ${original.id} could not be refreshed. Its outcome is unconfirmed`,
    ),
  );
  expect(dialog).not.toHaveTextContent("Status has been refreshed");
  expect(
    screen.queryByRole("button", { name: "Publish this version" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Saved block Gantt", hidden: true }),
  ).not.toBeInTheDocument();
  failRefresh = false;
  const requestsBeforeRetry = fetcher.mock.calls.length;
  await user.click(
    within(dialog).getByRole("button", { name: "Refresh status" }),
  );
  await waitFor(() =>
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(
    await screen.findByRole("button", { name: "Current publication" }),
  ).toBeDisabled();
  expect(
    fetcher.mock.calls.slice(requestsBeforeRetry).map(([url]) => url),
  ).toContain(`/api/plans/${original.id}/export?format=json`);
  expect(
    fetcher.mock.calls.filter(([url]) => url.endsWith("/publish")),
  ).toHaveLength(1);
});

it("blocks navigation during analysis and aborts its response ownership on unmount", async () => {
  let resolve!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.startsWith("/api/plans/overview"))
      return Response.json(plannerOverview([original]));
    if (url.endsWith("/export?format=json"))
      return Response.json(plannerExport(original));
    if (url.endsWith("/analysis")) {
      signal = options?.signal ?? undefined;
      return new Promise<Response>((finish) => {
        resolve = finish;
      });
    }
    throw new Error(`Unexpected ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  const view = render(<SavedPlansWorkspace />);
  await ready();
  const currentUrl = window.location.href;
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Objective" }),
    "min-changes",
  );
  await waitFor(() => expect(signal).toBeDefined());
  const callCount = fetcher.mock.calls.length;
  window.history.replaceState(null, "", "/plans?night=2026-09-17");
  fireEvent.popState(window);
  expect(window.location.href).toBe(currentUrl);
  expect(fetcher.mock.calls).toHaveLength(callCount);
  expect(
    screen.getByRole("combobox", { name: "Planning night" }),
  ).toBeDisabled();
  expect(signal!.aborted).toBe(false);
  view.unmount();
  expect(signal!.aborted).toBe(true);
  await act(async () =>
    resolve(
      Response.json({
        operation: "preview",
        result: plannerResult,
        basis: { planId: original.id },
        parameters: {
          planningNight: original.planningNight,
          strategy: "min-changes",
          locked: [],
        },
        stale: false,
        currentSourceRevision: "1",
      }),
    ),
  );
  expect(fetcher.mock.calls).toHaveLength(callCount);
  expect(screen.queryByText("Unsaved preview")).not.toBeInTheDocument();
});
