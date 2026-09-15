import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ContractorCoordinationCase,
  PlannerCoordinationCase,
} from "@railplan/core/types/coordination";
import { plannerResult, plannerVersion, plannerExport, plannerOverview } from "./fixtures/planner-workspace";
import { CoordinationWorkspace } from "@/components/coordination/CoordinationWorkspace";
import { CoordinationSummary } from "@/components/coordination/CoordinationSummary";
import { SavedPlansWorkspace } from "@/components/plans/SavedPlansWorkspace";

vi.mock("@/components/notifications/PlanNotifications", () => ({ PlanNotifications: () => null }));

const caseId = "10000000-0000-4000-8000-000000000001";
const otherCaseId = "10000000-0000-4000-8000-000000000002";
const orgId = "20000000-0000-4000-8000-000000000001";
const sourcePlanId = "30000000-0000-4000-8000-000000000001";
const appliedPlanId = "40000000-0000-4000-8000-000000000001";
const ownerId = "50000000-0000-4000-8000-000000000001";
const change = {
  requestId: "R-60000000-0000-4000-8000-000000000001",
  organisationId: orgId,
  submissionRevision: 3,
  kind: "changed" as const,
  before: { requestId: "R-60000000-0000-4000-8000-000000000001", teamId: "T-TRK", startMinute: 30, endMinute: 60, locked: false },
  after: { requestId: "R-60000000-0000-4000-8000-000000000001", teamId: "T-TRK", startMinute: 90, endMinute: 120, locked: true },
  beforeDeferral: null,
  afterDeferral: null,
};

function plannerCase(overrides: Partial<PlannerCoordinationCase> = {}): PlannerCoordinationCase {
  return {
    id: caseId,
    scope: "planner",
    version: 1,
    planningNight: "2026-09-16",
    state: "open",
    deadline: "2026-09-16T01:00:00Z",
    ownerId,
    selectedRequestIds: [change.requestId],
    currentRevision: 1,
    viewedRevision: 1,
    confirmations: [{ organisationId: orgId, revision: 1, status: "pending" }],
    changes: [change],
    overdue: false,
    createdAt: "2026-09-15T00:00:00Z",
    proposals: [{
      revision: 1,
      sourcePlanId,
      sourceRevision: "8",
      sourceDigest: "source-digest",
      inputDigest: "input-digest",
      solverVersion: plannerResult.solverVersion,
      constraintVersion: plannerResult.constraintVersion,
      parameters: { planningNight: "2026-09-16", strategy: "balanced", locked: [change.after!] },
      result: plannerResult,
      resultDigest: "result-digest",
      impactDigest: "impact-digest",
      changes: [change],
      requestRevisions: { [change.requestId]: 3 },
      createdAt: "2026-09-15T00:00:00Z",
      state: "proposed",
      appliedPlanId: null,
      stale: false,
    }],
    events: [],
    ...overrides,
  };
}

function contractorCase(): ContractorCoordinationCase {
  return {
    id: caseId,
    scope: "contractor",
    version: 1,
    planningNight: "2026-09-16",
    state: "open",
    deadline: null,
    currentRevision: 1,
    viewedRevision: 1,
    confirmations: [{ organisationId: orgId, revision: 1, status: "pending" }],
    changes: [change],
    overdue: false,
    createdAt: "2026-09-15T00:00:00Z",
    proposalState: "proposed",
  };
}

function json(value: unknown, init?: ResponseInit) {
  return Response.json(value, init);
}

function workspaceFetch(value: PlannerCoordinationCase | ContractorCoordinationCase, action?: (body: Record<string, unknown>) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/requests/catalogue") return json({ catalogue: { organisations: [{ id: orgId, name: "North Works" }], nights: [], blocks: [], workClasses: [], equipment: [], roles: [] } });
    if (url.includes("/actions")) return action?.(JSON.parse(String(init?.body))) ?? json({ case: value });
    if (url.startsWith("/api/coordination")) return json({ cases: [value], nextCursor: null, owners: value.scope === "planner" ? [{ id: ownerId, isCurrentUser: true }] : undefined });
    throw new Error(`Unexpected URL ${url}`);
  });
}

beforeEach(() => window.history.replaceState(null, "", "/plans/coordination"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("planner coordination", () => {
  it("creates a case from a real inspector alternative and preserves the selected context", async () => {
    const saved = plannerVersion();
    let createBody: Record<string, unknown> | null = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/plans/overview")) return json(plannerOverview([saved]));
      if (url.includes("/export?")) return json(plannerExport(saved));
      if (url.endsWith("/analysis")) {
        const body = JSON.parse(String(init?.body));
        return json({
          operation: "inspect",
          requestId: body.requestId,
          result: plannerResult,
          parameters: { planningNight: saved.planningNight, strategy: "balanced", locked: [] },
          currentSourceRevision: "1",
          basis: { planId: saved.id, sourceRevision: "1", solverVersion: plannerResult.solverVersion, constraintVersion: plannerResult.constraintVersion, inputDigest: saved.inputDigest },
          explanation: { summary: "Validated", blockers: [] },
          alternatives: [{ id: "real-option", requestId: body.requestId, startMinute: 90, endMinute: 120, feasible: true, displacedRequestIds: [], movementMinutesDelta: 0, weightedCompletionDelta: 0, bindingRuleId: null, summary: "Validated", whyItWorks: "No conflicts", impact: "One move" }],
          stale: false,
        });
      }
      if (url === "/api/coordination") {
        createBody = JSON.parse(String(init?.body));
        return json({ case: plannerCase() }, { status: 201 });
      }
      if (url === "/api/requests/catalogue") return json({ catalogue: { organisations: [] } });
      if (url.startsWith("/api/coordination?")) return json({ cases: [], nextCursor: null, owners: [] });
      throw new Error(`Unexpected URL ${url}`);
    }));
    const user = userEvent.setup();
    render(<SavedPlansWorkspace />);
    await screen.findByRole("button", { name: "Version details" });
    await user.click(await screen.findByRole("button", { name: "Coordinate validated slot 01:30–02:00" }));
    await waitFor(() => expect(createBody).not.toBeNull());
    expect(createBody).toMatchObject({ sourcePlanId: saved.id, selectedRequestIds: [expect.any(String)], parameters: { planningNight: saved.planningNight, strategy: "balanced", locked: [expect.objectContaining({ startMinute: 90, endMinute: 120 })] } });
    const link = await screen.findByRole("link", { name: "Open coordination case" });
    const target = new URL(link.getAttribute("href")!, "http://localhost");
    expect(target.pathname).toBe("/plans/coordination");
    expect(target.searchParams.get("case")).toBe(caseId);
    expect(target.searchParams.get("night")).toBe(saved.planningNight);
    expect(target.searchParams.get("plan")).toBe(saved.id);
    expect(target.searchParams.get("request")).toBeTruthy();
  });

  it("reuses the create-case idempotency key after an uncertain response", async () => {
    const saved = plannerVersion();
    const keys: string[] = [];
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/plans/overview")) return json(plannerOverview([saved]));
      if (url.includes("/export?")) return json(plannerExport(saved));
      if (url.endsWith("/analysis")) {
        const body = JSON.parse(String(init?.body));
        return json({ operation: "inspect", requestId: body.requestId, result: plannerResult, parameters: { planningNight: saved.planningNight, strategy: "balanced", locked: [] }, currentSourceRevision: "1", basis: { planId: saved.id }, explanation: { summary: "Validated", blockers: [] }, alternatives: [], stale: false });
      }
      if (url === "/api/coordination") {
        const body = JSON.parse(String(init?.body));
        keys.push(body.idempotencyKey);
        if (attempts++ === 0) throw new TypeError("response lost");
        return json({ case: plannerCase() }, { status: 201 });
      }
      if (url === "/api/requests/catalogue") return json({ catalogue: { organisations: [] } });
      if (url.startsWith("/api/coordination?")) return json({ cases: [], nextCursor: null, owners: [] });
      throw new Error(`Unexpected URL ${url}`);
    }));
    const user = userEvent.setup();
    render(<SavedPlansWorkspace />);
    const action = await screen.findByRole("button", { name: "Coordinate current saved parameters" });
    await user.click(action);
    await screen.findByRole("alert");
    await user.click(action);
    await screen.findByRole("link", { name: "Open coordination case" });
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("keeps Apply enabled while confirmation is pending and opens the exact organisation approval dialog", async () => {
    vi.stubGlobal("fetch", workspaceFetch(plannerCase()));
    const user = userEvent.setup();
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);
    const apply = await screen.findByRole("button", { name: "Apply proposal" });
    expect(apply).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Mark organisation approved" }));
    expect(screen.getByRole("textbox", { name: "Confirmation note" })).toBeVisible();
    expect(within(screen.getByRole("dialog")).getByText("North Works")).toBeInTheDocument();
  });

  it("shows a newer revision as pending without inheriting the older approval", async () => {
    const first = plannerCase();
    const secondProposal = { ...first.proposals[0], revision: 2, createdAt: "2026-09-15T01:00:00Z" };
    const revised = plannerCase({
      version: 3,
      currentRevision: 2,
      viewedRevision: 2,
      proposals: [first.proposals[0], secondProposal],
      confirmations: [{ organisationId: orgId, revision: 2, status: "pending" }],
      events: [{ id: "70000000-0000-4000-8000-000000000001", action: "approve", revision: 1, actorId: ownerId, createdAt: "2026-09-15T00:30:00Z", note: "Approved in meeting", organisationId: orgId, confirmedAt: "2026-09-15T00:20:00Z" }],
    });
    vi.stubGlobal("fetch", workspaceFetch(revised));
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);
    expect(await screen.findByText("Pending organisation approval")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Proposal revision 2" })).toBeInTheDocument();
    expect(screen.getByText(/Approval recorded for revision 1/)).toBeInTheDocument();
  });

  it("aligns historical confirmation evidence and disables Apply on an older revision", async () => {
    const first = plannerCase();
    const revisionOne = { ...first.proposals[0], state: "superseded" as const };
    const revisionTwo = {
      ...first.proposals[0],
      revision: 2,
      createdAt: "2026-09-15T01:00:00Z",
    };
    const revised = plannerCase({
      version: 3,
      currentRevision: 2,
      viewedRevision: 2,
      proposals: [revisionOne, revisionTwo],
      confirmations: [{ organisationId: orgId, revision: 2, status: "pending" }],
      events: [{ id: "70000000-0000-4000-8000-000000000001", action: "approve", revision: 1, actorId: ownerId, createdAt: "2026-09-15T00:30:00Z", note: "Approved in meeting", organisationId: orgId, confirmedAt: "2026-09-15T00:20:00Z" }],
    });
    vi.stubGlobal("fetch", workspaceFetch(revised));
    const user = userEvent.setup();
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);
    await user.click(await screen.findByRole("button", { name: "Revision 1" }));

    expect(screen.getByRole("button", { name: "Apply proposal" })).toBeDisabled();
    expect(within(screen.getByRole("region", { name: "Organisation confirmations" })).getByText("Organisation approved")).toBeInTheDocument();
    expect(screen.queryByText("Pending organisation approval")).not.toBeInTheDocument();
  });

  it("retains the confirmation note when the API rejects the mutation", async () => {
    vi.stubGlobal("fetch", workspaceFetch(plannerCase(), () => json({ error: { message: "This case changed. Reload before trying again." } }, { status: 409 })));
    const user = userEvent.setup();
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);
    await screen.findByRole("button", { name: "Apply proposal" });
    await user.click(screen.getByRole("button", { name: "Mark organisation approved" }));
    const note = screen.getByRole("textbox", { name: "Confirmation note" });
    await user.type(note, "Confirmed during the 09:00 coordination meeting");
    await user.click(screen.getByRole("button", { name: "Save organisation approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This case changed");
    expect(note).toHaveValue("Confirmed during the 09:00 coordination meeting");
  });

  it("retains the applied saved-plan ID without relying on a follow-up reload", async () => {
    const applied = plannerCase({ version: 2 });
    applied.proposals[0].state = "applied";
    applied.proposals[0].appliedPlanId = appliedPlanId;
    vi.stubGlobal("fetch", workspaceFetch(plannerCase(), () => json({ case: applied, appliedPlanId })));
    const user = userEvent.setup();
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);
    await user.click(await screen.findByRole("button", { name: "Apply proposal" }));
    const link = await screen.findByRole("link", { name: new RegExp(`Open newly applied saved draft ${appliedPlanId.slice(0, 8)}`) });
    expect(link).toHaveAttribute("href", `/plans?night=2026-09-16&plan=${appliedPlanId}`);
  });

  it("reuses the Apply idempotency key after an uncertain response", async () => {
    const keys: string[] = [];
    let attempts = 0;
    const applied = plannerCase({ version: 2 });
    applied.proposals[0].state = "applied";
    applied.proposals[0].appliedPlanId = appliedPlanId;
    vi.stubGlobal("fetch", workspaceFetch(plannerCase(), (body) => {
      keys.push(String(body.idempotencyKey));
      if (attempts++ === 0) throw new TypeError("response lost");
      return json({ case: applied, appliedPlanId });
    }));
    const user = userEvent.setup();
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);
    const apply = await screen.findByRole("button", { name: "Apply proposal" });
    await user.click(apply);
    await screen.findByRole("alert");
    await user.click(apply);
    await screen.findByRole("link", { name: new RegExp(appliedPlanId.slice(0, 8)) });
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("does not accept a delayed preview for revision inputs changed in flight", async () => {
    let resolvePreview!: (response: Response) => void;
    const pendingPreview = new Promise<Response>((resolve) => {
      resolvePreview = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/requests/catalogue") return json({ catalogue: { organisations: [] } });
      if (url.endsWith("/analysis")) return pendingPreview;
      if (url.startsWith("/api/coordination")) return json({ cases: [plannerCase()], nextCursor: null, owners: [] });
      throw new Error(`Unexpected URL ${url} ${init?.method ?? "GET"}`);
    }));
    const user = userEvent.setup();
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);
    const source = await screen.findByRole("textbox", { name: "Source plan ID" });
    await user.click(screen.getByRole("button", { name: "Preview proposal revision" }));
    await user.clear(source);
    await user.type(source, sourcePlanId.replace(/1$/, "9"));
    await act(async () => {
      resolvePreview(json({
        operation: "preview",
        result: plannerResult,
        parameters: { planningNight: "2026-09-16", strategy: "balanced", locked: [] },
        basis: { planId: sourcePlanId },
        stale: false,
      }));
    });

    expect(screen.getByRole("button", { name: "Save new proposal revision" })).toBeDisabled();
    expect(screen.queryByText(/^Preview:/)).not.toBeInTheDocument();
  });

  it("invalidates a pending preview when the active case resets edited inputs", async () => {
    let resolvePreview!: (response: Response) => void;
    const pendingPreview = new Promise<Response>((resolve) => {
      resolvePreview = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/requests/catalogue") return json({ catalogue: { organisations: [] } });
      if (url.endsWith("/analysis")) return pendingPreview;
      if (url.startsWith("/api/coordination")) return json({ cases: [plannerCase()], nextCursor: null, owners: [] });
      throw new Error(`Unexpected URL ${url}`);
    }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);
    const source = await screen.findByRole("textbox", { name: "Source plan ID" });
    await user.clear(source);
    await user.type(source, sourcePlanId.replace(/1$/, "9"));
    await user.click(screen.getByRole("button", { name: "Preview proposal revision" }));
    await user.click(screen.getByRole("button", { name: `Open coordination case ${caseId}` }));
    expect(source).toHaveValue(sourcePlanId);
    await act(async () => {
      resolvePreview(json({
        operation: "preview",
        result: plannerResult,
        parameters: { planningNight: "2026-09-16", strategy: "balanced", locked: [] },
        basis: { planId: sourcePlanId.replace(/1$/, "9") },
        stale: false,
      }));
    });

    expect(screen.getByRole("button", { name: "Save new proposal revision" })).toBeDisabled();
    expect(screen.queryByText(/^Preview:/)).not.toBeInTheDocument();
  });

  it("does not restore a prior case when its delayed mutation finishes after navigation", async () => {
    const other = plannerCase({ id: otherCaseId, selectedRequestIds: ["M-002"] });
    let resolveMutation!: (response: Response) => void;
    const pendingMutation = new Promise<Response>((resolve) => {
      resolveMutation = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/requests/catalogue") return json({ catalogue: { organisations: [] } });
      if (url.includes("/actions")) return pendingMutation;
      if (url.startsWith("/api/coordination")) return json({ cases: [plannerCase(), other], nextCursor: null, owners: [] });
      throw new Error(`Unexpected URL ${url}`);
    }));
    const user = userEvent.setup();
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);
    await user.click(await screen.findByRole("button", { name: "Apply proposal" }));
    await user.click(screen.getByRole("button", { name: `Open coordination case ${otherCaseId}` }));
    await act(async () => {
      resolveMutation(json({ case: plannerCase({ version: 2 }) }));
    });

    expect(screen.getByRole("button", { name: `Open coordination case ${otherCaseId}` })).toHaveAttribute("aria-pressed", "true");
    expect(new URL(window.location.href).searchParams.get("case")).toBe(otherCaseId);
  });

  it("protects an edited revision across Back and reselects the URL case after confirmation", async () => {
    const other = plannerCase({ id: "90000000-0000-4000-8000-000000000002" });
    const fetcher = workspaceFetch(plannerCase());
    fetcher.mockImplementationOnce(async () => json({ cases: [plannerCase(), other], nextCursor: null, owners: [{ id: ownerId, isCurrentUser: true }] }));
    vi.stubGlobal("fetch", fetcher);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);
    await user.click(await screen.findByRole("button", { name: `Open coordination case ${other.id}` }));
    await user.clear(screen.getByRole("textbox", { name: "Source plan ID" }));
    await user.type(screen.getByRole("textbox", { name: "Source plan ID" }), sourcePlanId.replace(/1$/, "9"));
    act(() => {
      window.history.replaceState(window.history.state, "", `/plans/coordination?case=${caseId}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: `Open coordination case ${other.id}` })).toHaveAttribute("aria-pressed", "true");
    confirm.mockReturnValue(true);
    act(() => {
      window.history.replaceState(window.history.state, "", `/plans/coordination?case=${caseId}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: `Open coordination case ${caseId}` })).toHaveAttribute("aria-pressed", "true"));
  });

  it("states that seeded operator work has no contractor approval", async () => {
    const seeded = plannerCase({
      confirmations: [],
      changes: [{ ...change, requestId: "M-001", organisationId: null, submissionRevision: null }],
    });
    seeded.proposals[0].changes = seeded.changes;
    vi.stubGlobal("fetch", workspaceFetch(seeded));
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);
    expect(await screen.findByText("Operator-owned work — no contractor approval applicable")).toBeInTheDocument();
  });

  it("paginates with the applied filters when the filter form has unapplied edits", async () => {
    const second = plannerCase({ id: otherCaseId, selectedRequestIds: ["M-002"] });
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      if (url === "/api/requests/catalogue") return json({ catalogue: { organisations: [] } });
      if (url.includes("cursor=")) return json({ cases: [second], nextCursor: null, owners: [] });
      if (url.startsWith("/api/coordination")) return json({ cases: [plannerCase()], nextCursor: caseId, owners: [] });
      throw new Error(`Unexpected URL ${url}`);
    }));
    const user = userEvent.setup();
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} initialPlanningNight="2026-09-16" />);
    await screen.findByRole("button", { name: `Open coordination case ${caseId}` });
    await user.clear(screen.getByLabelText("Planning night"));
    await user.type(screen.getByLabelText("Planning night"), "2026-09-17");
    await user.click(screen.getByRole("button", { name: "Load more cases" }));
    await screen.findByRole("button", { name: `Open coordination case ${otherCaseId}` });

    expect(urls).toContain(`/api/coordination?planningNight=2026-09-16&cursor=${caseId}`);
    expect(urls).not.toContain(`/api/coordination?planningNight=2026-09-17&cursor=${caseId}`);
  });
});

describe("contractor coordination", () => {
  it("shows only scoped request changes and supports a retained request-changes note without planner-only links", async () => {
    vi.stubGlobal("fetch", workspaceFetch(contractorCase(), () => json({ error: { message: "Reload the case and try again." } }, { status: 409 })));
    const user = userEvent.setup();
    render(<CoordinationWorkspace role="contractor" initialCaseId={caseId} />);
    expect(await screen.findByText(change.requestId)).toBeInTheDocument();
    expect(screen.queryByText("Foreign track renewal")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /source plan/i })).not.toBeInTheDocument();
    expect(screen.queryByText("result-digest")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request changes" }));
    const note = screen.getByRole("textbox", { name: "Requested changes note" });
    await user.type(note, "Please keep the earlier access window");
    await user.click(screen.getByRole("button", { name: "Send request for changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Reload the case");
    expect(note).toHaveValue("Please keep the earlier access window");
  });

  it("loads the next scoped case page without changing the selected case", async () => {
    const first = contractorCase();
    const second = { ...contractorCase(), id: otherCaseId };
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      if (url === `/api/coordination?cursor=${caseId}`) {
        return json({ cases: [second], nextCursor: null });
      }
      if (url === "/api/coordination") {
        return json({ cases: [first], nextCursor: caseId });
      }
      throw new Error(`Unexpected URL ${url}`);
    }));
    const user = userEvent.setup();
    render(<CoordinationWorkspace role="contractor" initialCaseId={caseId} />);
    const selectedButton = await screen.findByRole("button", { name: `Open coordination case ${caseId}` });
    await user.click(screen.getByRole("button", { name: "Load more cases" }));

    expect(await screen.findByRole("button", { name: `Open coordination case ${otherCaseId}` })).toBeInTheDocument();
    expect(selectedButton).toHaveAttribute("aria-pressed", "true");
    expect(urls).toContain(`/api/coordination?cursor=${caseId}`);
  });
});

describe("exact saved-plan coordination", () => {
  it("labels and links the exact applied revision rather than the latest case revision", async () => {
    const exact = plannerCase({
      currentRevision: 2,
      viewedRevision: 1,
      confirmations: [{ organisationId: orgId, revision: 1, status: "approved", confirmedAt: "2026-09-15T00:20:00Z", note: "Meeting" }],
    });
    exact.proposals[0].appliedPlanId = appliedPlanId;
    exact.proposals[0].state = "applied";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/requests/catalogue") return json({ catalogue: { organisations: [{ id: orgId, name: "North Works" }] } });
      expect(url).toBe(`/api/coordination?appliedPlanId=${appliedPlanId}`);
      return json({ cases: [exact], nextCursor: null, owners: [] });
    }));
    render(<CoordinationSummary planId={appliedPlanId} />);
    expect(await screen.findByText(/Applied proposal revision 1/)).toBeInTheDocument();
    expect(screen.queryByText(/revision 2 confirmations/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open coordination case" })).toHaveAttribute("href", `/plans/coordination?case=${caseId}&night=2026-09-16&plan=${appliedPlanId}`);
  });

  it("does not disable publication when the exact applied-plan confirmation is pending", async () => {
    const saved = plannerVersion({ id: appliedPlanId });
    const exact = plannerCase({ confirmations: [{ organisationId: orgId, revision: 1, status: "pending" }] });
    exact.proposals[0].appliedPlanId = appliedPlanId;
    exact.proposals[0].state = "applied";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/plans/overview")) return json(plannerOverview([saved]));
      if (url.includes("/export?")) return json(plannerExport(saved));
      if (url.endsWith("/analysis")) {
        const request = JSON.parse(String(init?.body));
        return json({ operation: "inspect", requestId: request.requestId, basis: { planId: saved.id }, explanation: { summary: "Validated", blockers: [] }, alternatives: [], stale: false });
      }
      if (url === "/api/requests/catalogue") return json({ catalogue: { organisations: [{ id: orgId, name: "North Works" }] } });
      if (url === `/api/coordination?appliedPlanId=${appliedPlanId}`) return json({ cases: [exact], nextCursor: null, owners: [] });
      throw new Error(`Unexpected URL ${url}`);
    }));
    render(<SavedPlansWorkspace />);
    expect(await screen.findByText("Pending organisation approval")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review publication" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Review publication" }));
    expect(await within(screen.getByRole("dialog")).findByText("Pending organisation approval")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Publish this version" })).toBeEnabled();
  });

  it("selects the exact case from a direct URL", async () => {
    const other = plannerCase({ id: otherCaseId, selectedRequestIds: ["M-002"] });
    const fetcher = workspaceFetch(plannerCase());
    fetcher.mockImplementationOnce(async () => json({ cases: [other, plannerCase()], nextCursor: null, owners: [{ id: ownerId, isCurrentUser: true }] }));
    vi.stubGlobal("fetch", fetcher);
    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);
    expect(await screen.findByRole("heading", { name: new RegExp(caseId.slice(0, 8)) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Open coordination case ${caseId}` })).toHaveAttribute("aria-pressed", "true");
  });

  it("fetches an exact direct-link case that is absent from a nonempty first page", async () => {
    const firstPageCase = plannerCase({ id: otherCaseId, selectedRequestIds: ["M-002"] });
    const requested = plannerCase();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/requests/catalogue") {
        return json({ catalogue: { organisations: [], nights: [], blocks: [], workClasses: [], equipment: [], roles: [] } });
      }
      if (url === `/api/coordination/${caseId}`) return json({ case: requested });
      if (url.startsWith("/api/coordination")) {
        return json({ cases: [firstPageCase], nextCursor: otherCaseId, owners: [] });
      }
      throw new Error(`Unexpected URL ${url}`);
    }));

    render(<CoordinationWorkspace role="planner" initialCaseId={caseId} />);

    expect(await screen.findByRole("heading", { name: new RegExp(caseId.slice(0, 8)) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Open coordination case ${caseId}` })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toContain(`case=${caseId}`);
  });
});
