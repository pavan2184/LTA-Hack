import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestIntakeWorkspace } from "@/components/requests/RequestIntakeWorkspace";
const catalogue = {
  nights: [
    {
      planningNight: "2026-09-16",
      startMinute: 0,
      endMinute: 240,
      slotMinutes: 15,
    },
  ],
  blocks: [{ id: "NS10-NS11", label: "NS10–NS11" }],
  workClasses: ["civil"],
  equipment: [{ id: "E-TEST", name: "Inspection kit", capacity: 1 }],
  roles: [{ id: "technician", name: "Technician" }],
  teams: [{ id: "T-TRK", name: "Track Engineering", skills: ["track"] }],
  dependencies: [],
};
const fields = {
  planningNight: "2026-09-16",
  title: "Inspection",
  description: "Inspect fabricated track",
  workClass: "civil",
  blockIds: ["NS10-NS11"],
  durationMinutes: 30,
  preferredStart: 0,
  earliestStart: 0,
  latestEnd: 240,
  equipment: [],
  workforce: [{ roleId: "technician", count: 2 }],
};
const request = {
  id: "c3a7fa4a-606e-4d1f-859b-bbca03ec0e49",
  organisationId: "org",
  organisationName: "Demo contractor",
  version: 1,
  status: "draft",
  fields,
  approval: null,
  activeApprovedRevision: null,
  scheduled: null,
  history: [],
  revisions: [],
  createdAt: "2026-09-07T08:00:00Z",
  updatedAt: "2026-09-07T08:00:00Z",
};
function stub(
  mutate: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/requests/catalogue")
        return Promise.resolve(Response.json({ catalogue }));
      if (url === "/api/requests" && !init?.method)
        return Promise.resolve(Response.json({ requests: [request] }));
      if (url === `/api/requests/${request.id}` && !init?.method)
        return Promise.resolve(Response.json({ request }));
      return Promise.resolve(mutate(url, init));
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());
describe("structured request intake", () => {
  it("saves current edits before submitting with the returned version", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    stub((url, init) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return Response.json({
        request: {
          ...request,
          version: calls.length + 1,
          status: url.endsWith("/actions") ? "submitted" : "draft",
        },
      });
    });
    const user = userEvent.setup();
    render(<RequestIntakeWorkspace role="contractor" />);
    await user.click(
      await screen.findByRole("button", { name: /Open Inspection/ }),
    );
    await user.type(screen.getByLabelText("Title"), " update");
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0].body).toMatchObject({
      expectedVersion: 1,
      fields: { title: "Inspection update" },
    });
    expect(calls[1].body).toMatchObject({
      expectedVersion: 2,
      action: "submit",
    });
    expect(
      await screen.findByText("Request is now submitted."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeDisabled();
  });
  it("keeps approved work read-only and creates a separate draft revision", async () => {
    const approved = {
      ...request,
      version: 3,
      status: "approved",
      activeApprovedRevision: 3,
    };
    let payload: unknown;
    stub((_url, init) => {
      payload = JSON.parse(String(init?.body));
      return Response.json({
        request: { ...approved, version: 4, status: "draft" },
      });
    });
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) =>
        url === `/api/requests/${request.id}` && !init?.method
          ? Promise.resolve(Response.json({ request: approved }))
          : original(url, init),
      ),
    );
    const user = userEvent.setup();
    render(<RequestIntakeWorkspace role="contractor" />);
    await user.click(
      await screen.findByRole("button", { name: /Open Inspection/ }),
    );
    expect(screen.getByLabelText("Title")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save draft" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Propose revision" }));
    await waitFor(() =>
      expect(payload).toMatchObject({ expectedVersion: 3, action: "revise" }),
    );
    expect(
      await screen.findByText("Request is now draft."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeEnabled();
    expect(
      screen.getByText(/Approved revision 3 remains the planning input/),
    ).toBeInTheDocument();
  });
  it("opens an organisation request and saves explicit contractor fields with a version guard", async () => {
    let saved: unknown;
    stub((_url, init) => {
      saved = JSON.parse(String(init?.body));
      return Response.json({
        request: {
          ...request,
          version: 2,
          fields: { ...fields, title: "Revised inspection" },
        },
      });
    });
    const user = userEvent.setup();
    render(<RequestIntakeWorkspace role="contractor" />);
    await user.click(
      await screen.findByRole("button", { name: /Open Inspection/ }),
    );
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Revised inspection");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(saved).toMatchObject({
        expectedVersion: 1,
        fields: {
          title: "Revised inspection",
          workforce: [{ roleId: "technician", count: 2 }],
        },
      }),
    );
    expect(JSON.stringify(saved)).not.toMatch(
      /organisationId|createdBy|"status"/,
    );
    expect(screen.queryByLabelText("Team assignment")).not.toBeInTheDocument();
  });
  it("shows field errors from submission and preserves the entered draft", async () => {
    stub(() =>
      Response.json(
        {
          error: {
            code: "invalid_request",
            message: "Complete the required fields.",
            fieldErrors: { description: "Describe the proposed work." },
          },
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    render(<RequestIntakeWorkspace role="contractor" />);
    await user.click(
      await screen.findByRole("button", { name: /Open Inspection/ }),
    );
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(
      await within(await screen.findByRole("alert")).findByText(
        "Describe the proposed work.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Inspection");
    expect(screen.getByLabelText("Description")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Description")).toHaveAccessibleDescription(
      "Describe the proposed work.",
    );
  });
  it("requires planner scheduling fields and explicit safety confirmation before approval", async () => {
    const submitted = { ...request, status: "submitted", version: 2 };
    let body: unknown;
    stub((_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        request: {
          ...submitted,
          status: "approved",
          version: 3,
          activeApprovedRevision: 3,
        },
      });
    });
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) =>
        url === `/api/requests/${request.id}` && !init?.method
          ? Promise.resolve(Response.json({ request: submitted }))
          : original(url, init),
      ),
    );
    const user = userEvent.setup();
    render(<RequestIntakeWorkspace role="planner" />);
    await user.click(
      await screen.findByRole("button", { name: /Open Inspection/ }),
    );
    expect(
      screen.getByRole("button", { name: "Approve request" }),
    ).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Team assignment"), "T-TRK");
    await user.click(
      screen.getByLabelText(/I confirm the configured safety constraints/),
    );
    await user.type(
      screen.getByLabelText("Decision reason"),
      "Reviewed fabricated request",
    );
    await user.click(screen.getByRole("button", { name: "Approve request" }));
    await waitFor(() =>
      expect(body).toMatchObject({
        expectedVersion: 2,
        action: "approve",
        reason: "Reviewed fabricated request",
        approval: { teamId: "T-TRK", safetyConfirmed: true },
      }),
    );
  });
  it("explains a blocked cancellation even when the planner fields are hidden", async () => {
    const approved = {
      ...request,
      version: 3,
      status: "approved",
      activeApprovedRevision: 3,
    };
    stub(() =>
      Response.json(
        {
          error: {
            code: "invalid_request",
            message: "Correct the highlighted request fields.",
            fieldErrors: {
              dependencies:
                "Active approved work depends on this request. Resolve those dependencies first.",
            },
          },
        },
        { status: 400 },
      ),
    );
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) =>
        url === `/api/requests/${request.id}` && !init?.method
          ? Promise.resolve(Response.json({ request: approved }))
          : original(url, init),
      ),
    );
    const user = userEvent.setup();
    render(<RequestIntakeWorkspace role="contractor" />);
    await user.click(
      await screen.findByRole("button", { name: /Open Inspection/ }),
    );
    await user.type(
      screen.getByLabelText("Decision reason"),
      "Cancel duplicate work",
    );
    await user.click(screen.getByRole("button", { name: "Cancel request" }));
    expect(
      await screen.findByText(/Active approved work depends on this request/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Decision reason")).toHaveValue(
      "Cancel duplicate work",
    );
    expect(
      screen.getByRole("button", { name: "Cancel request" }),
    ).toBeEnabled();
  });
  it("shows all immutable scheduling fields when a later draft is being edited", async () => {
    const oldFields = {
      ...fields,
      preferredStart: 15,
      equipment: [{ equipmentId: "E-TEST", units: 1 }],
    };
    const snapshot = {
      ...request,
      version: 4,
      activeApprovedRevision: 3,
      fields: { ...fields, title: "New proposal" },
      revisions: [
        {
          version: 3,
          status: "approved",
          fields: oldFields,
          approval: {
            teamId: "T-TRK",
            priority: "high",
            clearanceMinutes: 10,
            requiredSkills: ["track"],
            dependencies: ["M-001"],
            dependencyLagMinutes: 15,
            safetyConfirmed: true,
          },
          createdAt: "2026-09-07T08:00:00Z",
        },
      ],
    };
    stub(() => Response.json({ request: snapshot }));
    const original = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) =>
        url === `/api/requests/${request.id}` && !init?.method
          ? Promise.resolve(Response.json({ request: snapshot }))
          : original(url, init),
      ),
    );
    const user = userEvent.setup();
    render(<RequestIntakeWorkspace role="contractor" />);
    await user.click(
      await screen.findByRole("button", { name: /Open Inspection/ }),
    );
    await user.click(screen.getByText("Status and revision history"));
    await user.click(screen.getByText("Revision 3 · approved"));
    expect(screen.getByText(/Work class: civil/)).toBeInTheDocument();
    expect(screen.getByText(/Preferred start: 00:15/)).toBeInTheDocument();
    expect(screen.getByText(/Equipment: E-TEST: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Required skills: track/)).toBeInTheDocument();
    expect(screen.getByText(/Dependencies: M-001/)).toBeInTheDocument();
    expect(screen.getByText(/Dependency gap: 15 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/Safety confirmed: yes/)).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("New proposal");
  });
  it("recovers from a network failure without claiming a save succeeded", async () => {
    stub(() => Promise.reject(new Error("offline")));
    const user = userEvent.setup();
    render(<RequestIntakeWorkspace role="contractor" />);
    await user.click(
      await screen.findByRole("button", { name: /Open Inspection/ }),
    );
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByText(/could not reach the server/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });
});

describe("submitted transcript provenance", () => {
  it("shows immutable evidence and manual attribution beside separate planner controls", async () => {
    const source = {
      draftId: "draft-source",
      submittedRevision: 3,
      submittedAt: "2026-09-07T00:00:00Z",
      submittedBy: "owner",
      fields,
      confidence: { title: 0.8 },
      manualFields: ["description"],
      evidence: [
        {
          field: "title",
          quote: "Inspection source quote",
          timestamp: "00:12",
          start: 0,
          end: 23,
        },
      ],
      model: "test-model",
      extractorVersion: "transcript-v1",
      revisions: [
        {
          version: 1,
          action: "extract",
          status: "private",
          actorId: "owner",
          reason: "Extracted",
          createdAt: "2026-09-07T00:00:00Z",
          fields: { ...fields, description: null },
          confidence: { title: 0.8 },
          manualFields: [],
          evidence: [
            {
              field: "title",
              quote: "Original retained quote",
              start: 0,
              end: 23,
              timestamp: null,
            },
          ],
          model: "test-model",
          extractorVersion: "transcript-v1",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/requests/catalogue")
          return Response.json({ catalogue });
        if (url === "/api/requests")
          return Response.json({
            requests: [{ ...request, status: "submitted" }],
          });
        return Response.json({
          request: { ...request, status: "submitted", proposalSource: source },
        });
      }),
    );
    const user = userEvent.setup();
    render(<RequestIntakeWorkspace role="planner" />);
    await user.click(
      await screen.findByRole("button", { name: "Open Inspection" }),
    );
    const provenance = await screen.findByRole("region", {
      name: "Submitted proposal provenance",
    });
    expect(
      within(provenance).getByText("Inspection source quote", {
        selector: "blockquote",
      }),
    ).toBeInTheDocument();
    expect(
      within(provenance).getByText("Manual · human supplied"),
    ).toBeInTheDocument();
    await user.click(within(provenance).getByText(/Revision 1/));
    expect(
      within(provenance).getByText("Original retained quote", {
        selector: "blockquote",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Planner confirmation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve request" }),
    ).toBeInTheDocument();
  });
});

it("preserves manual edits until saved or explicitly discarded before request navigation", async () => {
  stub(() => Response.json({ request }));
  render(<RequestIntakeWorkspace role="contractor" />);
  await userEvent.click(await screen.findByRole("button", { name: /Open Inspection/ }));
  await userEvent.type(screen.getByLabelText("Title"), " changed");
  for (const name of ["New request", "Refresh requests", "Open Inspection"]) expect(screen.getByRole("button", { name })).toBeDisabled();
  expect(screen.getByLabelText("Title")).toHaveValue("Inspection changed");
  await userEvent.click(screen.getByRole("button", { name: "Discard unsaved changes" }));
  expect(screen.getByLabelText("Title")).toHaveValue("Inspection");
  expect(screen.getByRole("button", { name: "New request" })).toBeEnabled();
});
