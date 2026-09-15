import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestSubmission } from "@railplan/core/types/requests";
import { ContractorSchedule } from "@/components/requests/ContractorSchedule";

const planId = "11223344-1122-4122-8122-112233445566";
const catalogue = {
  nights: [{ planningNight: "2026-09-16", startMinute: 0, endMinute: 240, slotMinutes: 15 }],
  blocks: [
    { id: "NS10-NS11", label: "Admiralty to Sembawang" },
    { id: "NS11-NS12", label: "Sembawang to Canberra" },
  ],
  workClasses: ["civil"],
  equipment: [],
  roles: [{ id: "technician", name: "Technician" }],
};
function request(over: Partial<RequestSubmission> = {}): RequestSubmission {
  return {
    id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
    organisationId: "org",
    organisationName: "Fixture Rail Services",
    version: 3,
    status: "approved",
    fields: {
      planningNight: "2026-09-16", title: "Walkway inspection", description: "", workClass: "civil",
      blockIds: ["NS10-NS11", "NS11-NS12"], durationMinutes: 60, preferredStart: 180, earliestStart: 0,
      latestEnd: 240, equipment: [], workforce: [{ roleId: "technician", count: 2 }],
    },
    approval: null,
    activeApprovedRevision: 3,
    scheduled: { planId, revision: 3, startMinute: 75, endMinute: 135, acknowledgement: null },
    history: [],
    revisions: [],
    createdAt: "2026-09-15T00:00:00Z",
    updatedAt: "2026-09-15T00:00:00Z",
    ...over,
  };
}
function stub(rows: RequestSubmission[], onPost?: (body: unknown) => RequestSubmission | Response) {
  const calls: { url: string; body?: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url.endsWith("/catalogue")) return Response.json({ catalogue });
    if (url.endsWith("/acknowledge")) {
      const result = onPost!(body);
      return result instanceof Response ? result : Response.json({ request: result }, { status: 201 });
    }
    return Response.json({ requests: rows });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("contractor schedule", () => {
  it("shows the published time against the requested time in station names, and confirms it", async () => {
    const row = request();
    const calls = stub([row], () => ({
      ...row,
      scheduled: { ...row.scheduled!, acknowledgement: { kind: "confirmed", reason: "", createdAt: "2026-09-15T08:00:00Z" } },
    }));
    render(<ContractorSchedule />);
    const schedule = await screen.findByRole("region", { name: "Your schedule" });
    expect(schedule).toHaveTextContent("Walkway inspection");
    expect(schedule).toHaveTextContent("Admiralty to Sembawang to Sembawang to Canberra");
    expect(schedule).toHaveTextContent("01:15–02:15");
    expect(schedule).toHaveTextContent("105 min earlier than you requested (03:00)");
    expect(schedule).not.toHaveTextContent(planId);
    expect(schedule).toHaveTextContent("1 of 1 awaiting your answer");
    await userEvent.click(within(schedule).getByRole("button", { name: "Confirm this time" }));
    expect(await within(schedule).findByText("Confirmed")).toBeInTheDocument();
    expect(calls.at(-1)).toMatchObject({
      url: `/api/requests/${row.id}/acknowledge`,
      body: { planId, kind: "confirmed", reason: "" },
    });
    expect(schedule).toHaveTextContent("All 1 answered");
  });

  it("requires a reason before saying a time cannot be made, and shows the answer afterwards", async () => {
    const row = request();
    const calls = stub([row], (body) => ({
      ...row,
      scheduled: { ...row.scheduled!, acknowledgement: { kind: "cannot_comply", reason: (body as { reason: string }).reason, createdAt: "2026-09-15T08:00:00Z" } },
    }));
    render(<ContractorSchedule />);
    const schedule = await screen.findByRole("region", { name: "Your schedule" });
    await userEvent.click(within(schedule).getByRole("button", { name: "Cannot make this time" }));
    expect(within(schedule).getByRole("button", { name: "Send to the planner" })).toBeDisabled();
    await userEvent.type(within(schedule).getByLabelText("What prevents this time?"), "Our crew starts at 01:00.");
    await userEvent.click(within(schedule).getByRole("button", { name: "Send to the planner" }));
    expect(await within(schedule).findByText("You cannot make this time")).toBeInTheDocument();
    expect(schedule).toHaveTextContent("Your reason: Our crew starts at 01:00.");
    expect(calls.at(-1)?.body).toMatchObject({ kind: "cannot_comply", reason: "Our crew starts at 01:00." });
    expect(within(schedule).getByRole("button", { name: "Change my answer" })).toBeInTheDocument();
  });

  it("keeps the answer on screen when the schedule has moved on and explains why", async () => {
    const row = request();
    stub([row], () => Response.json({ error: { code: "conflict", message: "The published schedule has changed. Reload to see the current time before answering.", requestId: "x", fieldErrors: {} } }, { status: 409 }));
    render(<ContractorSchedule />);
    const schedule = await screen.findByRole("region", { name: "Your schedule" });
    await userEvent.click(within(schedule).getByRole("button", { name: "Confirm this time" }));
    expect(await within(schedule).findByRole("alert")).toHaveTextContent("The published schedule has changed");
    expect(within(schedule).getByRole("button", { name: "Confirm this time" })).toBeEnabled();
  });

  it("says plainly when nothing is published yet", async () => {
    stub([request({ scheduled: null })]);
    render(<ContractorSchedule />);
    expect(await screen.findByText(/No published times yet/)).toBeInTheDocument();
  });
});
