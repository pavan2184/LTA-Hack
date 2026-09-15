import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CarryForwardPreparation } from "@/components/deferred-work/CarryForwardPreparation";
import { RequestIntakeWorkspace } from "@/components/requests/RequestIntakeWorkspace";
const item = { id: "10000000-0000-4000-8000-000000000001", version: 4, organisationId: null, proposedNight: null, sourceNight: "2026-09-16" };
afterEach(() => vi.unstubAllGlobals());
it("requires explicit dependency and exact-publication review before sending approval", async () => {
  const current = { id: "30000000-0000-4000-8000-000000000001", organisationId: "org", organisationName: "Track team", version: 2, status: "submitted", fields: { planningNight: "2026-09-17", title: "Review carried work", description: "Inspect rail", workClass: "civil", blockIds: ["NS10-NS11"], durationMinutes: 15, preferredStart: 0, earliestStart: 0, latestEnd: 240, equipment: [], workforce: [{ roleId: "technician", count: 1 }] }, approval: null, activeApprovedRevision: null, scheduled: null, history: [], revisions: [], createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z", carryForward: { workItemId: item.id, sourceNight: "2026-09-16", targetNight: "2026-09-17", expectedWorkVersion: 5, originalDependencies: ["M-001"], publication: { planId: "40000000-0000-4000-8000-000000000001", submissionRevision: null } } };
  const commands: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/requests/catalogue") return Response.json({ catalogue: { organisations: [], nights: [{ planningNight: "2026-09-17", startMinute: 0, endMinute: 240, slotMinutes: 15 }], blocks: [{ id: "NS10-NS11", label: "NS10–NS11" }], workClasses: ["civil"], equipment: [], roles: [{ id: "technician", name: "Technician" }], teams: [{ id: "T-TRK", name: "Track", skills: [] }], dependencies: [] } });
    if (url === "/api/requests") return Response.json({ requests: [current] });
    if (!init?.method) return Response.json({ request: current });
    commands.push(JSON.parse(String(init.body)));
    return Response.json({ error: { message: "Current work changed. Reload before approval." } }, { status: 409 });
  }));
  render(<RequestIntakeWorkspace role="planner" selectedRequestId={current.id} />);
  await screen.findByText("M-001");
  await userEvent.selectOptions(screen.getByLabelText("Team assignment"), "T-TRK");
  await userEvent.click(screen.getByLabelText(/I confirm the configured safety constraints/));
  await userEvent.type(screen.getByLabelText("Decision reason"), "Reviewed target-night work");
  await userEvent.click(screen.getByRole("button", { name: "Approve request" }));
  expect(commands).toHaveLength(0);
  await userEvent.click(screen.getByLabelText("I reviewed and resolved target-night dependencies"));
  await userEvent.click(screen.getByLabelText("I confirm retirement of this exact published source"));
  await userEvent.click(screen.getByRole("button", { name: "Approve request" }));
  expect(commands[0]).toMatchObject({ carryForward: { expectedWorkVersion: 5, dependenciesReviewed: true, publication: current.carryForward.publication } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Current work changed");
  expect(screen.getByLabelText("I reviewed and resolved target-night dependencies")).toBeChecked();
});
it("requires trusted organisation selection and retains the exact draft link after preparation", async () => {
  const commands: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/requests/catalogue") return Response.json({ catalogue: { organisations: [{ id: "20000000-0000-4000-8000-000000000001", name: "Track team" }], nights: [{ planningNight: "2026-09-17" }] } });
    commands.push(JSON.parse(String(init?.body)));
    return Response.json({ requestId: "30000000-0000-4000-8000-000000000001" });
  }));
  render(<CarryForwardPreparation item={item} onPrepared={() => { throw new Error("Reload failed"); }} />);
  await userEvent.click(screen.getByRole("button", { name: "Prepare carry-forward request" }));
  await userEvent.selectOptions(await screen.findByLabelText("Carry-forward target night"), "2026-09-17");
  expect(screen.getByRole("button", { name: "Create linked draft" })).toBeDisabled();
  await userEvent.selectOptions(screen.getByLabelText("Carry-forward organisation"), "20000000-0000-4000-8000-000000000001");
  await userEvent.click(screen.getByRole("button", { name: "Create linked draft" }));
  expect(await screen.findByRole("link", { name: "Review linked draft" })).toHaveAttribute("href", expect.stringContaining("request=30000000-0000-4000-8000-000000000001"));
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({ action: "prepare-carry-forward", expectedVersion: 4, targetNight: "2026-09-17", organisationId: "20000000-0000-4000-8000-000000000001" });
});
it("retains input and retry identity on an uncertain preparation response", async () => {
  const commands: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/requests/catalogue") return Response.json({ catalogue: { organisations: [], nights: [{ planningNight: "2026-09-17" }] } });
    commands.push(JSON.parse(String(init?.body)));
    return Response.json({ error: { message: "Connection interrupted. Retry the same preparation." } }, { status: 503 });
  }));
  render(<CarryForwardPreparation item={{ ...item, organisationId: "20000000-0000-4000-8000-000000000001" }} onPrepared={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "Prepare carry-forward request" }));
  await userEvent.selectOptions(await screen.findByLabelText("Carry-forward target night"), "2026-09-17");
  await userEvent.click(screen.getByRole("button", { name: "Create linked draft" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection interrupted");
  expect(screen.getByLabelText("Carry-forward target night")).toHaveValue("2026-09-17");
  await userEvent.click(screen.getByRole("button", { name: "Create linked draft" }));
  expect(commands[0].idempotencyKey).toBe(commands[1].idempotencyKey);
});
