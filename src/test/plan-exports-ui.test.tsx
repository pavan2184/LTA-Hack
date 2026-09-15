import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SavedPlanExports } from "@/components/plans/SavedPlanExports";
const id = "6c494154-2b92-4890-8b8a-8a522254fe42";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function downloads() {
  const create = vi.fn(() => "blob:controlled-export");
  const revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: create,
      revokeObjectURL: revoke,
    }),
  );
  const clicked: { href: string; download: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ href: this.href, download: this.download });
  });
  return { create, revoke, clicked };
}
it.each(["json", "csv"] as const)(
  "downloads the selected saved %s artifact without altering its payload",
  async (format) => {
    const payload =
      format === "json"
        ? '{"planVersion":"saved","status":"INFEASIBLE"}'
        : 'status,reason\r\nINFEASIBLE,"Unicode 建设"\r\n';
    const fetcher = vi.fn().mockResolvedValue(
      new Response(payload, {
        headers: {
          "Content-Type": format === "json" ? "application/json" : "text/csv",
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const output = downloads();
    render(<SavedPlanExports planId={id} />);
    await userEvent.click(
      screen.getByRole("button", { name: `Download ${format.toUpperCase()}` }),
    );
    await waitFor(() => expect(output.clicked).toHaveLength(1));
    expect(fetcher.mock.calls[0][0]).toBe(
      `/api/plans/${id}/export?format=${format}`,
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      cache: "no-store",
      method: "GET",
    });
    expect(output.clicked[0].download).toBe(`railplan-${id}.${format}`);
    expect(
      await (output.create.mock.calls[0] as unknown as [Blob])[0].text(),
    ).toBe(payload);
  },
);
it("shows authorization failure without downloading an error response", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "Planner access is required." } }),
          { status: 403 },
        ),
      ),
  );
  const output = downloads();
  render(<SavedPlanExports planId={id} />);
  await userEvent.click(screen.getByRole("button", { name: "Download JSON" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Planner access is required.",
  );
  expect(output.clicked).toHaveLength(0);
  expect(output.create).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Download CSV" })).toBeEnabled();
});
it("does not download a stale in-flight response after selecting another plan", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const output = downloads();
  const view = render(<SavedPlanExports key={id} planId={id} />);
  await userEvent.click(screen.getByRole("button", { name: "Download JSON" }));
  const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
  view.rerender(<SavedPlanExports key="different" planId="different" />);
  expect(signal.aborted).toBe(true);
  finish(new Response('{"old":"plan"}'));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Download JSON" })).toBeEnabled(),
  );
  expect(output.clicked).toHaveLength(0);
});
it("offers an explicit retry after a network failure without exposing upstream details", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("sensitive upstream details")),
  );
  const output = downloads();
  render(<SavedPlanExports planId={id} />);
  await userEvent.click(screen.getByRole("button", { name: "Download CSV" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to download",
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent("sensitive");
  expect(output.clicked).toHaveLength(0);
});

it("the real saved-plan workspace aborts an old export when the selected version changes", async () => {
  const { SavedPlansWorkspace } =
    await import("@/components/plans/SavedPlansWorkspace");
  const nextId = "120c95e7-5349-4b6f-81e4-3a227a92097f";
  const { plannerVersion, plannerExport, plannerOverview, plannerInspection } = await import("./fixtures/planner-workspace");
  const plan = (planId: string) => plannerVersion({ id: planId });
  window.history.replaceState(null, "", "/plans");
  let completeOld!: (response: Response) => void;
  let oldSignal: AbortSignal | undefined;
  const fetcher = vi
    .fn()
    .mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith("/analysis")) return Promise.resolve(plannerInspection(url, init));
      if (url.startsWith("/api/plans/overview"))
        return Promise.resolve(
          Response.json(plannerOverview([plan(id), plan(nextId)])),
        );
      if (url === `/api/plans/${id}/export?format=json` && init?.method === "GET") {
        oldSignal = init?.signal as AbortSignal;
        return new Promise<Response>((resolve) => {
          completeOld = resolve;
        });
      }
      if (url === `/api/plans/${id}/export?format=json`)
        return Promise.resolve(
          Response.json(plannerExport(plan(id))),
        );
      if (url === `/api/plans/${nextId}/export?format=json`)
        return Promise.resolve(
          Response.json(plannerExport(plan(nextId))),
        );
      throw new Error("Unexpected fixture URL");
    });
  vi.stubGlobal("fetch", fetcher);
  const output = downloads();
  render(<SavedPlansWorkspace />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Version details" }));
  await user.click(
    await screen.findByRole("button", { name: "Download JSON" }),
  );
  await user.click(screen.getByRole("button", { name: "Close" }));
  await user.click(screen.getByRole("button", { name: "Switch version" }));
  await user.click(screen.getByRole("button", { name: `Open version ${nextId}` }));
  await waitFor(() => expect(oldSignal?.aborted).toBe(true));
  completeOld(new Response('{"old":"version"}'));
  await user.click(await screen.findByRole("button", { name: "Version details" }));
  await screen.findByText(nextId);
  expect(output.clicked).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Download CSV" })).toBeEnabled();
});

// Saved snapshot visuals have real-component and combined journey coverage.
vi.mock("@/components/plans/SavedPlanReview", () => ({ SavedPlanReview: () => null }));
