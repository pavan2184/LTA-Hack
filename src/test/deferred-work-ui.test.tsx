import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ContractorWorkItem, PlannerWorkItem, WorkItem, WorkItemPage } from "@railplan/core/types/deferred-work";
import { DeferredWorkWorkspace } from "@/components/deferred-work/DeferredWorkWorkspace";
import { DeferredWorkSummary } from "@/components/deferred-work/DeferredWorkSummary";
import { plannerExport } from "./fixtures/planner-workspace";

const id = "10000000-0000-4000-8000-000000000001";
const ownerId = "20000000-0000-4000-8000-000000000001";
const secondOwner = "20000000-0000-4000-8000-000000000002";
function item(overrides: Partial<PlannerWorkItem> = {}): PlannerWorkItem {
  return { id, scope: "planner", title: "Inspect rail fasteners", sourceNight: "2026-09-16", sourceRequestId: "M-014", sourcePlanId: "30000000-0000-4000-8000-000000000001", organisationId: null, dueDate: null, priority: "high", repeatThreshold: 2, proposedNight: null, state: "open", effectiveDeferredNights: ["2026-09-16"], deferredCount: 1, flags: { overdue: false, repeated: false, missingDueDate: true, missingOwner: false, awaitingTargetNightReview: false }, createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z", ownerId, version: 7, events: [{ id: "event-1", kind: "record", night: "2026-09-16", planId: null, requestId: "M-014", actorId: ownerId, note: "Window unavailable", metadata: {}, createdAt: "2026-09-15T00:00:00Z" }], historyTruncated: false, submissions: [], ...overrides };
}
function contractor(): ContractorWorkItem {
  const { sourcePlanId, ownerId: owner, version, events, historyTruncated, submissions, ...base } = item();
  void [sourcePlanId, owner, version, events, historyTruncated, submissions];
  return { ...base, scope: "contractor", organisationId: "40000000-0000-4000-8000-000000000001", state: "scheduled" };
}
function page(items: WorkItem[] = [item()], nextCursor: string | null = null): WorkItemPage {
  return { items, nextCursor, today: "2026-09-15", nights: [{ planningNight: "2026-09-17", startMinute: 0, endMinute: 240 }], owners: [{ id: ownerId, isCurrentUser: true }, { id: secondOwner, isCurrentUser: false }] };
}
function serve(value: WorkItem = item(), action?: (body: Record<string, unknown>) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/actions")) return action?.(JSON.parse(String(init?.body))) ?? Response.json({ workItem: value });
    if (url === `/api/deferred-work/${value.id}`) return Response.json({ workItem: value });
    if (url.startsWith("/api/deferred-work")) return Response.json(page([value]));
    throw new Error(`Unexpected request ${url}`);
  });
}
beforeEach(() => window.history.replaceState(null, "", "/plans/deferred"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("shows missing due dates and requires a note for planner completion", async () => {
  const user = userEvent.setup();
  let command: Record<string, unknown> | undefined;
  vi.stubGlobal("fetch", serve(item(), body => { command = body; return Response.json({ workItem: item({ version: 8, state: "completed" }) }); }));
  render(<DeferredWorkWorkspace role="planner" />);
  expect(await screen.findByText("Needs due date")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Mark completed" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "Save action" })).toBeDisabled();
  await user.type(within(dialog).getByLabelText("Reason"), "Field work confirmed complete");
  await user.click(within(dialog).getByRole("button", { name: "Save action" }));
  await waitFor(() => expect(command).toEqual({ action: "complete", expectedVersion: 7, note: "Field work confirmed complete" }));
  expect(await screen.findByText(/Saved work item/)).toBeVisible();
  await waitFor(() => expect(screen.getByRole("heading", { name: "Inspect rail fasteners" })).toHaveFocus());
});

it("renders the narrow contractor DTO without planner actions, history or source links", async () => {
  vi.stubGlobal("fetch", serve(contractor()));
  render(<DeferredWorkWorkspace role="contractor" />);
  expect(await screen.findByText("Needs due date")).toBeVisible();
  expect(screen.getByText(/Scheduled does not mean completed/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Mark completed" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Work owner")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Open source plan" })).not.toBeInTheDocument();
  expect(screen.queryByText("Audit history")).not.toBeInTheDocument();
  expect(screen.queryByText("Window unavailable")).not.toBeInTheDocument();
});

it("persists trusted owner edits with the exact latest version", async () => {
  const user = userEvent.setup();
  let command: Record<string, unknown> | undefined;
  vi.stubGlobal("fetch", serve(item(), body => { command = body; return Response.json({ workItem: item({ ownerId: secondOwner, version: 8 }) }); }));
  render(<DeferredWorkWorkspace role="planner" />);
  await user.selectOptions(await screen.findByLabelText("Work owner"), secondOwner);
  await user.click(screen.getByRole("button", { name: "Save metadata" }));
  await waitFor(() => expect(command).toMatchObject({ action: "update", expectedVersion: 7, ownerId: secondOwner }));
  expect(screen.getByLabelText("Work owner")).toHaveValue(secondOwner);
});

it("preserves metadata after mutation errors and cancelled navigation", async () => {
  const user = userEvent.setup();
  vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.stubGlobal("fetch", serve(item(), () => Response.json({ error: { message: "This work item changed. Reload before trying again." } }, { status: 409 })));
  render(<DeferredWorkWorkspace role="planner" />);
  await user.selectOptions(await screen.findByLabelText("Work owner"), secondOwner);
  await user.click(screen.getByRole("button", { name: "Save metadata" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("This work item changed");
  await user.click(screen.getByRole("button", { name: "Reload backlog" }));
  expect(window.confirm).toHaveBeenCalled();
  expect(screen.getByLabelText("Work owner")).toHaveValue(secondOwner);
});

it("uses applied overdue and repeated filters for subsequent cursor pages", async () => {
  const user = userEvent.setup();
  const queries: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === `/api/deferred-work/${id}`) return Response.json({ workItem: item() });
    queries.push(url);
    return Response.json(page([item()], id));
  }));
  render(<DeferredWorkWorkspace role="planner" />);
  await screen.findByLabelText("Work owner");
  await user.click(screen.getByLabelText("Overdue only"));
  await user.click(screen.getByLabelText("Repeated deferrals only"));
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() => expect(queries.some(url => url.includes("overdue=true") && url.includes("repeated=true"))).toBe(true));
  await user.click(screen.getByLabelText("Overdue only"));
  await user.click(screen.getByRole("button", { name: "Load more work" }));
  await waitFor(() => expect(queries.at(-1)).toContain(`overdue=true&repeated=true&cursor=${id}`));
});

it("loads an exact ID outside the page, preserves it across filtering and reload", async () => {
  const user = userEvent.setup();
  window.history.replaceState(null, "", `/plans/deferred?work=${id}`);
  const fetcher = vi.fn(async (url: string) => Response.json(url === `/api/deferred-work/${id}` ? { workItem: item() } : page([])));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<DeferredWorkWorkspace role="planner" initialWorkId={id} />);
  expect(await screen.findByRole("heading", { name: "Inspect rail fasteners" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() => expect(screen.getByLabelText("Work owner")).toBeEnabled());
  expect(new URL(window.location.href).searchParams.get("work")).toBe(id);
  view.unmount();
  render(<DeferredWorkWorkspace role="planner" initialWorkId={id} />);
  expect(await screen.findByRole("heading", { name: "Inspect rail fasteners" })).toBeVisible();
});

it("reports a forbidden exact ID without falling back to another item", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url === `/api/deferred-work/${id}` ? { error: { message: "Work item not found." } } : page([contractor()]), url === `/api/deferred-work/${id}` ? { status: 404 } : undefined)));
  render(<DeferredWorkWorkspace role="contractor" initialWorkId={id} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Work item not found");
  expect(screen.queryByRole("heading", { name: "Inspect rail fasteners" })).not.toBeInTheDocument();
});

it("proposes only a configured night with a reason and no approval command", async () => {
  const user = userEvent.setup();
  let command: Record<string, unknown> | undefined;
  vi.stubGlobal("fetch", serve(item(), body => { command = body; return Response.json({ workItem: item({ proposedNight: "2026-09-17", version: 8 }) }); }));
  render(<DeferredWorkWorkspace role="planner" />);
  await user.click(await screen.findByRole("button", { name: "Propose target night" }));
  await user.selectOptions(screen.getByLabelText("Target night"), "2026-09-17");
  await user.type(screen.getByLabelText("Reason"), "Review next engineering window");
  await user.click(screen.getByRole("button", { name: "Save action" }));
  await waitFor(() => expect(command).toEqual({ action: "propose-night", expectedVersion: 7, planningNight: "2026-09-17", note: "Review next engineering window" }));
});

it("records a candidate only after explicit confirmation and retains its durable link", async () => {
  const user = userEvent.setup();
  const snapshot = plannerExport();
  const candidate = snapshot.deferrals[0];
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") { requests.push(JSON.parse(String(init.body))); return Response.json({ workItem: item() }); }
    if (url.includes("/export")) return Response.json(snapshot);
    return Response.json(page([]));
  }));
  render(<DeferredWorkSummary planId={snapshot.provenance.planId} requestId={candidate.requestId} />);
  await user.click(await screen.findByRole("button", { name: "Record deferral" }));
  expect(requests).toHaveLength(0);
  expect(within(screen.getByRole("dialog")).getByText(/Draft alternatives do not increment history/)).toBeVisible();
  await user.type(screen.getByLabelText("Deferral reason"), "Reviewed for later work");
  await user.click(screen.getByRole("button", { name: "Confirm deferral" }));
  expect(await screen.findByRole("link", { name: "Open recorded work item" })).toHaveAttribute("href", `/plans/deferred?work=${id}`);
  expect(requests[0]).toMatchObject({ planId: snapshot.provenance.planId, requestId: candidate.requestId, reason: "Reviewed for later work" });
  expect(requests[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
});

it("keeps a successful mutation visible when the following list refresh fails", async () => {
  const user = userEvent.setup();
  let mutated = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/actions")) { mutated = true; return Response.json({ workItem: item({ version: 8, dueDate: "2026-09-20" }) }); }
    if (url === `/api/deferred-work/${id}`) return Response.json({ workItem: item() });
    if (mutated) return Response.json({ error: { message: "Reload unavailable" } }, { status: 503 });
    return Response.json(page());
  }));
  render(<DeferredWorkWorkspace role="planner" />);
  fireEvent.change(await screen.findByLabelText("Due date (SGT)"), { target: { value: "2026-09-20" } });
  await user.click(screen.getByRole("button", { name: "Save metadata" }));
  expect(await screen.findByText(/Saved work item/)).toHaveTextContent(id);
  expect(await screen.findByRole("alert")).toHaveTextContent("Reload unavailable");
  expect(screen.getByLabelText("Due date (SGT)")).toHaveValue("2026-09-20");
  expect(new URL(window.location.href).searchParams.get("work")).toBe(id);
});

it("confirms accepted work-item history traversal once and restores the exact target", async () => {
  const navigation = new EventTarget();
  vi.stubGlobal("navigation", navigation);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const other = item({ id: "10000000-0000-4000-8000-000000000002", title: "Other work" });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url === `/api/deferred-work/${other.id}` ? { workItem: other } : url === `/api/deferred-work/${id}` ? { workItem: item() } : page([item(), other]))));
  render(<DeferredWorkWorkspace role="planner" initialWorkId={id} />);
  fireEvent.change(await screen.findByLabelText("Due date (SGT)"), { target: { value: "2026-10-01" } });
  act(() => {
    navigation.dispatchEvent(Object.assign(new Event("navigate", { cancelable: true }), { navigationType: "traverse", destination: { sameDocument: true } }));
    window.history.replaceState(null, "", `/plans/deferred?work=${other.id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(await screen.findByRole("heading", { name: "Other work" })).toBeVisible();
  expect(confirm).toHaveBeenCalledTimes(1);
});

it("clears the previous detail when a changed exact URL cannot be read", async () => {
  const missing = "10000000-0000-4000-8000-000000000099";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith(missing) ? Response.json({ error: { message: "Missing exact work" } }, { status: 404 }) : Response.json(url === `/api/deferred-work/${id}` ? { workItem: item() } : page())));
  const view = render(<DeferredWorkWorkspace role="planner" initialWorkId={id} />);
  await screen.findByRole("heading", { name: "Inspect rail fasteners" });
  view.rerender(<DeferredWorkWorkspace role="planner" initialWorkId={missing} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Missing exact work");
  expect(screen.queryByRole("heading", { name: "Inspect rail fasteners" })).not.toBeInTheDocument();
});

it("reuses the recording key after an uncertain response and keeps the reason", async () => {
  const user = userEvent.setup();
  const snapshot = plannerExport();
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") { bodies.push(JSON.parse(String(init.body))); if (bodies.length === 1) throw new TypeError("Response lost"); return Response.json({ workItem: item() }); }
    return Response.json(url.includes("/export") ? snapshot : page());
  }));
  render(<DeferredWorkSummary planId={snapshot.provenance.planId} requestId={snapshot.deferrals[0].requestId} />);
  await user.click(await screen.findByRole("button", { name: "Record deferral" }));
  await user.type(screen.getByLabelText("Deferral reason"), "Needs another night");
  await user.click(screen.getByRole("button", { name: "Confirm deferral" }));
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Deferral reason")).toHaveValue("Needs another night");
  await user.click(screen.getByRole("button", { name: "Confirm deferral" }));
  expect(await screen.findByRole("link", { name: "Open recorded work item" })).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1].idempotencyKey).toBe(bodies[0].idempotencyKey);
});

it("returns keyboard focus to the action opener on Escape", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", serve());
  render(<DeferredWorkWorkspace role="planner" />);
  const button = await screen.findByRole("button", { name: "Mark completed" });
  button.focus(); await user.keyboard("{Enter}");
  expect(screen.getByRole("dialog")).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(button).toHaveFocus());
});

it("ignores a late detail response from the previously requested URL", async () => {
  const other = item({ id: "10000000-0000-4000-8000-000000000002", title: "Current URL work" });
  let release: ((response: Response) => void) | undefined;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === `/api/deferred-work/${id}`) return new Promise<Response>(resolve => { release = resolve; });
    return Response.json(url === `/api/deferred-work/${other.id}` ? { workItem: other } : page([item(), other]));
  }));
  const view = render(<DeferredWorkWorkspace role="planner" initialWorkId={id} />);
  await waitFor(() => expect(release).toBeDefined());
  view.rerender(<DeferredWorkWorkspace role="planner" initialWorkId={other.id} />);
  expect(await screen.findByRole("heading", { name: "Current URL work" })).toBeVisible();
  await act(async () => release!(Response.json({ workItem: item() })));
  expect(screen.queryByRole("heading", { name: "Inspect rail fasteners" })).not.toBeInTheDocument();
  expect(new URL(window.location.href).searchParams.get("work")).toBe(other.id);
});
