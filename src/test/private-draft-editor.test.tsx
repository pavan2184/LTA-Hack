import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranscriptDraftWorkspace } from "@/components/requests/TranscriptDraftWorkspace";

const fields = {
  planningNight: "2026-09-16",
  title: "Inspect walkway",
  description: null,
  workClass: "civil",
  blockIds: ["NS10-NS11"],
  durationMinutes: 30,
  preferredStart: 0,
  earliestStart: 0,
  latestEnd: 240,
  equipment: null,
  workforce: [{ roleId: "technician", count: 2 }],
};
const proposal = {
  fields,
  confidence: { title: 0.8 },
  missingFields: ["description", "equipment"],
  evidence: [
    {
      field: "title",
      quote: "Inspect walkway",
      start: 0,
      end: 15,
      timestamp: null,
    },
  ],
  manualFields: [],
  model: "test-model",
  extractorVersion: "transcript-v1",
};
const original = {
  ...proposal,
  version: 1,
  action: "extract",
  actorId: "owner",
  fromStatus: null,
  status: "private",
  reason: "Extracted",
  createdAt: "2026-09-07T00:00:00Z",
};
const draft = {
  ...proposal,
  id: "draft-1",
  version: 1,
  status: "private",
  ownerId: "owner",
  organisationId: null,
  submittedRequestId: null,
  createdAt: original.createdAt,
  updatedAt: original.createdAt,
  revisions: [original],
  validationErrors: {
    description: "Describe the work.",
    equipment: "Confirm equipment.",
  },
};
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
  equipment: [{ id: "E-TEST", name: "Inspection kit", capacity: 2 }],
  roles: [{ id: "technician", name: "Technician" }],
  organisations: [{ id: "org-1", name: "Demo contractor" }],
};
function setup(
  mutate: (url: string, body: Record<string, unknown>) => Response,
) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method) return mutate(url, JSON.parse(String(init.body)));
    if (url === "/api/ingestions/drafts")
      return Response.json({ drafts: [draft] });
    if (url === "/api/requests/catalogue") return Response.json({ catalogue });
    return Response.json({ draft });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
async function open() {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Review private draft" }),
  );
  await screen.findByRole("heading", { name: "Edit private proposal" });
  return user;
}
afterEach(() => vi.unstubAllGlobals());
describe("private draft editing and explicit sharing", () => {
  it("keeps unknowns null, saves a manual revision, then submits only the saved version", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const submitted = vi.fn();
    setup((url, body) => {
      calls.push({ url, body });
      const edited = {
        ...draft,
        fields: { ...fields, description: "Check surface", equipment: [] },
        version: 2,
        manualFields: ["description", "equipment"],
        missingFields: [],
        validationErrors: {},
      };
      return Response.json(
        url.endsWith("/submit")
          ? {
              draft: {
                ...edited,
                version: 3,
                status: "submitted",
                submittedRequestId: "request-1",
              },
              request: { id: "request-1" },
            }
          : { draft: edited },
      );
    });
    render(
      <TranscriptDraftWorkspace role="contractor" onSubmitted={submitted} />,
    );
    const user = await open();
    expect(screen.getByLabelText("Proposal description")).toHaveValue("");
    expect(screen.getByLabelText("Equipment information")).toHaveValue(
      "unknown",
    );
    await user.type(
      screen.getByLabelText("Proposal description"),
      "Check surface",
    );
    await user.selectOptions(
      screen.getByLabelText("Equipment information"),
      "none",
    );
    await user.type(
      screen.getByLabelText("Proposal decision reason"),
      "Confirmed with supervisor",
    );
    expect(
      screen.getByRole("button", { name: "Submit proposal for review" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Save private changes" }),
    );
    await screen.findByText("Private changes saved.");
    expect(calls[0].body).toMatchObject({
      expectedVersion: 1,
      fields: { description: "Check surface", equipment: [] },
    });
    expect(
      screen.queryByLabelText("Submission organisation"),
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Proposal decision reason"),
      "Share for planner review",
    );
    await user.click(
      screen.getByRole("button", { name: "Submit proposal for review" }),
    );
    await screen.findByText(/Submitted request: request-1/);
    expect(calls[1].body).toEqual({
      expectedVersion: 2,
      reason: "Share for planner review",
    });
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Save private changes" }),
    ).not.toBeInTheDocument();
  });
  it("preserves unsaved text and reason after a version conflict and displays field errors", async () => {
    setup(() =>
      Response.json(
        {
          error: {
            message: "Draft changed. Reload before retrying.",
            fieldErrors: { description: "Review the current description." },
          },
        },
        { status: 409 },
      ),
    );
    render(<TranscriptDraftWorkspace role="contractor" />);
    const user = await open();
    await user.type(
      screen.getByLabelText("Proposal description"),
      "Keep my unsaved work",
    );
    await user.type(
      screen.getByLabelText("Proposal decision reason"),
      "My correction",
    );
    await user.click(
      screen.getByRole("button", { name: "Save private changes" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Draft changed");
    expect(screen.getByLabelText("Proposal description")).toHaveValue(
      "Keep my unsaved work",
    );
    expect(
      screen.getByLabelText("Proposal description"),
    ).toHaveAccessibleDescription("Review the current description.");
    expect(screen.getByLabelText("Proposal decision reason")).toHaveValue(
      "My correction",
    );
  });
  it("requires a planner to choose a known organisation before explicitly sharing", async () => {
    const calls: Record<string, unknown>[] = [];
    setup((_url, body) => {
      calls.push(body);
      return Response.json(
        {
          error: {
            message: "Complete the proposal.",
            fieldErrors: { equipment: "Confirm equipment." },
          },
        },
        { status: 400 },
      );
    });
    render(<TranscriptDraftWorkspace role="planner" />);
    const user = await open();
    await user.type(
      screen.getByLabelText("Proposal decision reason"),
      "Request review",
    );
    expect(
      screen.getByRole("button", { name: "Submit proposal for review" }),
    ).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText("Submission organisation"),
      "org-1",
    );
    await user.click(
      screen.getByRole("button", { name: "Submit proposal for review" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Complete the proposal",
    );
    expect(calls[0]).toMatchObject({
      expectedVersion: 1,
      organisationId: "org-1",
    });
    expect(screen.getByLabelText("Submission organisation")).toHaveValue(
      "org-1",
    );
  });
  it("saves incomplete private fields without converting blank numbers or unknown equipment into facts", async () => {
    const calls: Record<string, unknown>[] = [];
    setup((_url, body) => {
      calls.push(body);
      return Response.json({
        draft: { ...draft, version: 2, fields: body.fields },
      });
    });
    render(<TranscriptDraftWorkspace role="contractor" />);
    const user = await open();
    fireEvent.change(screen.getByLabelText("Proposal duration (minutes)"), {
      target: { value: "" },
    });
    await user.type(
      screen.getByLabelText("Proposal decision reason"),
      "Duration needs confirmation",
    );
    await user.click(
      screen.getByRole("button", { name: "Save private changes" }),
    );
    await screen.findByText("Private changes saved.");
    expect(calls[0]).toMatchObject({
      fields: { durationMinutes: null, equipment: null, description: null },
    });
  });
  it("retains original extraction evidence in revision history while marking current human changes", async () => {
    setup(() => Response.json({}));
    render(<TranscriptDraftWorkspace role="contractor" />);
    const user = await open();
    await user.clear(screen.getByLabelText("Proposal title"));
    await user.type(
      screen.getByLabelText("Proposal title"),
      "Human correction",
    );
    const history = screen.getByRole("group", {
      name: "Saved proposal revisions",
    });
    await user.click(within(history).getByText(/Revision 1/));
    expect(
      within(history).getByText("Inspect walkway", { selector: "blockquote" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Unsaved manual changes: Title/),
    ).toBeInTheDocument();
  });
});

it("updates the shared request queue after submission while keeping an unrelated manual draft", async () => {
  const { RequestWorkspaces } = await import(
    "@/components/requests/RequestWorkspaces"
  );
  const sharedRequest = {
    id: "request-1",
    organisationId: "org-1",
    organisationName: "Demo contractor",
    version: 1,
    status: "submitted",
    fields: {
      ...fields,
      title: "Shared proposal",
      description: "Checked",
      equipment: [],
    },
    approval: null,
    activeApprovedRevision: null,
    scheduled: null,
    history: [],
    revisions: [],
    createdAt: original.createdAt,
    updatedAt: original.createdAt,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/submit"))
        return Response.json({
          draft: {
            ...draft,
            status: "submitted",
            submittedRequestId: sharedRequest.id,
            version: 2,
          },
          request: sharedRequest,
        });
      if (url === "/api/requests/catalogue")
        return Response.json({ catalogue });
      if (url === "/api/requests" && !init?.method)
        return Response.json({ requests: [] });
      if (url === "/api/ingestions/drafts")
        return Response.json({ drafts: [draft] });
      return Response.json({ draft });
    }),
  );
  render(<RequestWorkspaces role="contractor" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "New request" }));
  await user.type(
    screen.getByLabelText("Title"),
    "Unrelated unsaved manual work",
  );
  expect(screen.queryByRole("textbox", { name: "Meeting transcript" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "From meeting notes" }));
  await user.type(screen.getByLabelText("Meeting transcript"), "Keep these unsaved notes");
  await user.click(screen.getByRole("button", { name: "Your requests" }));
  expect(screen.getByLabelText("Title")).toHaveValue("Unrelated unsaved manual work");
  await user.click(screen.getByRole("button", { name: "From meeting notes" }));
  expect(screen.getByLabelText("Meeting transcript")).toHaveValue("Keep these unsaved notes");
  await open();
  await user.type(
    screen.getByLabelText("Proposal decision reason"),
    "Share confirmed proposal",
  );
  await user.click(
    screen.getByRole("button", { name: "Submit proposal for review" }),
  );
  await user.click(await screen.findByRole("link", { name: /Submitted request:/ }));
  expect(
    await screen.findByRole("button", { name: "Open Shared proposal" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Title")).toHaveValue(
    "Unrelated unsaved manual work",
  );
});
