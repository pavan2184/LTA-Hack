import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TranscriptDraftWorkspace } from "@/components/requests/TranscriptDraftWorkspace";
import { decodeTranscriptBytes } from "@/components/requests/transcript-input";
const fields = {
  planningNight: null,
  title: "Inspect walkway",
  description: null,
  workClass: null,
  blockIds: null,
  durationMinutes: null,
  preferredStart: null,
  earliestStart: null,
  latestEnd: null,
  equipment: null,
  workforce: null,
};
const draft = {
  id: "draft-1",
  version: 1,
  status: "private",
  manualFields: [],
  submittedRequestId: null,
  ownerId: "owner",
  organisationId: null,
  fields,
  confidence: { title: 0.8 },
  missingFields: Object.keys(fields).filter((k) => k !== "title"),
  evidence: [
    {
      field: "title",
      quote: "Inspect walkway",
      start: 0,
      end: 15,
      timestamp: null,
    },
  ],
  createdAt: "2026-09-07T00:00:00Z",
  updatedAt: "2026-09-07T00:00:00Z",
  model: "test-model",
  extractorVersion: "transcript-v1",
};
const response = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
afterEach(() => vi.unstubAllGlobals());
describe("private transcript drafts", () => {
  it("saves only after an explicit action and clears the transcript on success", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ drafts: [] }))
      .mockResolvedValueOnce(response({ drafts: [draft] }, 201));
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<TranscriptDraftWorkspace />);
    await screen.findByText("No private transcript drafts yet.");
    await user.type(
      screen.getByRole("textbox", { name: "Meeting transcript" }),
      "Inspect walkway",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Extract and save private drafts" }),
    );
    await screen.findByRole("heading", { name: "Inspect walkway" });
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/ingestions/transcript",
      expect.objectContaining({
        method: "POST",
        body: "Inspect walkway",
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    );
    expect(
      screen.getByRole("textbox", { name: "Meeting transcript" }),
    ).toHaveValue("");
    expect(screen.getByText(/80%.*model estimate/)).toBeInTheDocument();
    expect(
      screen.getByText("Inspect walkway", { selector: "blockquote" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /approve|submit/i }),
    ).not.toBeInTheDocument();
  });
  it("preserves input and explains an unavailable model without claiming a save", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ drafts: [] }))
        .mockResolvedValueOnce(
          response(
            {
              error: {
                code: "model_unavailable",
                message:
                  "Transcript extraction is unavailable. Use the manual request form.",
              },
            },
            503,
          ),
        ),
    );
    const user = userEvent.setup();
    render(<TranscriptDraftWorkspace />);
    await screen.findByText("No private transcript drafts yet.");
    await user.type(
      screen.getByRole("textbox", { name: "Meeting transcript" }),
      "Keep these notes",
    );
    await user.click(
      screen.getByRole("button", { name: "Extract and save private drafts" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Use the manual request form",
    );
    expect(
      screen.getByRole("textbox", { name: "Meeting transcript" }),
    ).toHaveValue("Keep these notes");
    expect(screen.queryByText(/drafts saved/i)).not.toBeInTheDocument();
  });
  it("bounds pasted UTF-8 bytes before sending", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ drafts: [] }));
    vi.stubGlobal("fetch", fetch);
    render(<TranscriptDraftWorkspace />);
    await screen.findByText("No private transcript drafts yet.");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Meeting transcript" }),
      { target: { value: "😀".repeat(16385) } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Extract and save private drafts" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("64 KB"),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("renders loaded private drafts with unknown fields visibly incomplete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ drafts: [draft] })),
    );
    render(<TranscriptDraftWorkspace />);
    await screen.findByRole("heading", { name: "Inspect walkway" });
    expect(screen.getAllByText("Needs information").length).toBeGreaterThan(0);
    expect(screen.getByText(/Private.*version 1/)).toBeInTheDocument();
  });
  it("waits for file reading before allowing extraction", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ drafts: [] }));
    vi.stubGlobal("fetch", fetch);
    render(<TranscriptDraftWorkspace />);
    await screen.findByText("No private transcript drafts yet.");
    let finish!: (value: ArrayBuffer) => void;
    const bytes = new TextEncoder().encode("Loaded meeting notes");
    const file = new File([bytes], "notes.txt", { type: "text/plain" });
    Object.defineProperty(file, "arrayBuffer", {
      value: () =>
        new Promise<ArrayBuffer>((resolve) => {
          finish = resolve;
        }),
    });
    fireEvent.change(screen.getByLabelText("UTF-8 text file"), {
      target: { files: [file] },
    });
    expect(
      screen.getByRole("button", { name: "Extract and save private drafts" }),
    ).toBeDisabled();
    await act(async () => {
      finish(bytes.buffer as ArrayBuffer);
    });
    expect(
      screen.getByRole("textbox", { name: "Meeting transcript" }),
    ).toHaveValue("Loaded meeting notes");
    expect(
      screen.getByRole("button", { name: "Extract and save private drafts" }),
    ).toBeEnabled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid file encoding, file type and byte size", () => {
    expect(() =>
      decodeTranscriptBytes(new Uint8Array([0xc3, 0x28]), "notes.txt"),
    ).toThrow(/UTF-8/);
    expect(() =>
      decodeTranscriptBytes(new Uint8Array(65537), "notes.txt"),
    ).toThrow(/64 KB/);
    expect(() =>
      decodeTranscriptBytes(new TextEncoder().encode("notes"), "notes.pdf"),
    ).toThrow(/\.txt/);
    expect(
      decodeTranscriptBytes(
        new TextEncoder().encode("Meeting notes"),
        "NOTES.TXT",
      ),
    ).toBe("Meeting notes");
  });
});
