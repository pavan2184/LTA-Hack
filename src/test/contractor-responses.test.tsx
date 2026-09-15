import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestSubmission } from "@railplan/core/types/requests";
import { ContractorResponses } from "@/components/plans/ContractorResponses";

const planId = "11223344-1122-4122-8122-112233445566";
function row(id: string, title: string, start: number, acknowledgement: RequestSubmission["scheduled"] extends infer S ? (S extends { acknowledgement: infer A } ? A : never) : never, plan = planId): RequestSubmission {
  return {
    id, organisationId: "org", organisationName: "Fixture Rail Services", version: 3, status: "approved",
    fields: { planningNight: "2026-09-16", title, description: "", workClass: "civil", blockIds: ["NS10-NS11"],
      durationMinutes: 60, preferredStart: 180, earliestStart: 0, latestEnd: 240, equipment: [], workforce: [] },
    approval: null, activeApprovedRevision: 3,
    scheduled: { planId: plan, revision: 3, startMinute: start, endMinute: start + 60, acknowledgement },
    history: [], revisions: [], createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z",
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("contractor responses", () => {
  it("summarises confirmed, declined and unanswered work for the published version only", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ requests: [
      row("a", "Walkway inspection", 60, { kind: "confirmed", reason: "", createdAt: "2026-09-15T08:00:00Z" }),
      row("b", "Drainage clearance", 120, { kind: "cannot_comply", reason: "Our crew starts at 01:00.", createdAt: "2026-09-15T08:05:00Z" }),
      row("c", "Point machine overhaul", 180, null),
      row("d", "Other version work", 30, null, "99999999-9999-4999-8999-999999999999"),
    ] })));
    render(<ContractorResponses planId={planId} />);
    const summary = await screen.findByRole("status", { name: "Response summary" });
    expect(summary).toHaveTextContent("1 confirmed");
    expect(summary).toHaveTextContent("1 cannot make the time");
    expect(summary).toHaveTextContent("1 awaiting an answer");
    const declined = screen.getByRole("list", { name: "Times contractors cannot make" });
    expect(declined).toHaveTextContent("Drainage clearance · Fixture Rail Services · 02:00–03:00");
    expect(declined).toHaveTextContent("Our crew starts at 01:00.");
    expect(declined).toHaveTextContent("Requested 03:00");
    expect(screen.getByText(/All scheduled contractor work \(3\)/)).toBeInTheDocument();
    expect(screen.queryByText("Other version work")).not.toBeInTheDocument();
  });

  it("says when nothing in the version needs confirming", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ requests: [] })));
    render(<ContractorResponses planId={planId} />);
    expect(await screen.findByText(/nothing to confirm/)).toBeInTheDocument();
  });
});
