"use client";
import { useEffect, useRef, useState } from "react";
import { type PrivateDraft } from "@railplan/core/types/ingestions";
import {
  decodeTranscriptBytes,
  MAX_TRANSCRIPT_BYTES,
} from "./transcript-input";
import type { RequestSubmission } from "@railplan/core/types/requests";
import type { UserRole } from "@railplan/core/types/auth";
import { PrivateDraftEditor } from "./PrivateDraftEditor";
import { ProposalEvidence, proposalLabels as labels } from "./ProposalEvidence";
import Link from "next/link";
import { useUnsavedChanges, writeSelection } from "@/lib/navigation/useUnsavedChanges";
const button =
  "planner-button";
async function result(response: Response): Promise<PrivateDraft[]> {
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body?.error?.message ??
        "Transcript drafts could not be loaded. Try again.",
    );
  if (!Array.isArray(body?.drafts))
    throw new Error("The server returned an unreadable response. Try again.");
  return body.drafts;
}
export function TranscriptDraftWorkspace({
  manualIntake = true,
  role = "contractor",
  onSubmitted,
  selectedDraftId,
  requestHref,
}: {
  manualIntake?: boolean;
  role?: UserRole;
  onSubmitted?: (request: RequestSubmission) => void;
  selectedDraftId?: string;
  requestHref?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(selectedDraftId ?? null);
  const [lastInitialId, setLastInitialId] = useState(selectedDraftId);
  if (lastInitialId !== selectedDraftId) {
    setLastInitialId(selectedDraftId);
    setSelectedId(selectedDraftId ?? null);
  }
  const [drafts, setDrafts] = useState<PrivateDraft[]>([]);
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = loading || saving || readingFile;
  useUnsavedChanges(Boolean(transcript) || saving || readingFile);
  function select(id: string | null) { setSelectedId(id); writeSelection("draft", id); }
  useEffect(() => {
    const pop = () => setSelectedId(new URLSearchParams(window.location.search).get("draft"));
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ingestions/drafts", { cache: "no-store" })
      .then(result)
      .then((rows) => {
        if (!cancelled) setDrafts(rows);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Private drafts could not be loaded. Refresh drafts to try again.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setDrafts(
        await result(
          await fetch("/api/ingestions/drafts", { cache: "no-store" }),
        ),
      );
    } catch {
      setError("Private drafts could not be loaded. Try again.");
    } finally {
      setLoading(false);
    }
  }
  async function extract() {
    setError("");
    setNotice("");
    if (!transcript.trim()) {
      setError("Paste a transcript or choose a UTF-8 .txt file.");
      return;
    }
    if (
      new TextEncoder().encode(transcript).byteLength > MAX_TRANSCRIPT_BYTES
    ) {
      setError("Keep the transcript within 64 KB.");
      return;
    }
    setSaving(true);
    try {
      let response: Response;
      try {
        response = await fetch("/api/ingestions/transcript", {
          method: "POST",
          headers: { "content-type": "text/plain; charset=utf-8" },
          body: transcript,
        });
      } catch {
        throw new Error(
          "Extraction could not reach the server. Your text is still here; try again or use the manual request form.",
        );
      }
      const saved = await result(response);
      setDrafts((current) => [
        ...saved,
        ...current.filter((d) => !saved.some((s) => s.id === d.id)),
      ]);
      setTranscript("");
      if (fileInput.current) fileInput.current.value = "";
      setNotice(
        `${saved.length} private draft${saved.length === 1 ? "" : "s"} saved. Review the evidence and missing information.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Extraction failed. Use the manual request form.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      aria-label="Private transcript drafts"
      className="min-w-0 space-y-4 border-t border-rule pt-6"
    >
      <header>
        <h2 className="text-xl font-semibold">Private transcript drafts</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-700">
          Paste meeting notes or choose a UTF-8 .txt file, up to 64 KB.
          Extraction sends the text to the configured model and saves only
          supported draft fields and short evidence excerpts. RailPlan does not
          save the full transcript.
        </p>
        <p className="mt-2 text-sm text-ink-700">
          Only you can see a private draft until you explicitly submit it.
          Submission shares its fields, evidence and saved revision history with
          the selected organisation and planners; it does not approve or
          schedule work.{" "}
          <Link className="underline" href={requestHref ?? (role === "planner" ? "/requests" : "/contractor")}>
            {manualIntake ? "Open manual requests" : "Return to request review"}
          </Link>{" "}when extraction is unavailable.
        </p>
      </header>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm">
          Meeting transcript
          <textarea
            aria-label="Meeting transcript"
            className="mt-1 w-full rounded border border-rule-strong bg-surface p-3 text-sm"
            rows={6}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          UTF-8 text file
          <input
            ref={fileInput}
            type="file"
            accept=".txt,text/plain"
            className="mt-1 block max-w-full text-sm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setReadingFile(true);
              setError("");
              setNotice("");
              try {
                if (file.size > MAX_TRANSCRIPT_BYTES)
                  throw new Error("Keep the transcript within 64 KB.");
                setTranscript(
                  decodeTranscriptBytes(
                    new Uint8Array(await file.arrayBuffer()),
                    file.name,
                  ),
                );
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "The file could not be read.",
                );
              } finally {
                setReadingFile(false);
                if (fileInput.current) fileInput.current.value = "";
              }
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className={`${button} primary`} onClick={extract}>
            Extract and save private drafts
          </button>
          <button
            className={button}
            onClick={() => {
              setTranscript("");
              setError("");
              setNotice("");
              if (fileInput.current) fileInput.current.value = "";
            }}
          >
            Clear transcript
          </button>
        </div>
      </fieldset>
      <button className={button} disabled={busy} onClick={refresh}>
        Refresh drafts
      </button>
      {loading && (
        <p role="status" className="text-sm">
          Loading private drafts…
        </p>
      )}
      {saving && (
        <p role="status" className="text-sm">
          Extracting supported fields and checking evidence…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="border border-signal-red p-3 text-sm text-signal-red"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-signal-green">
          {notice}
        </p>
      )}
      {!busy && !drafts.length && (
        <p className="text-sm text-ink-500">
          No private transcript drafts yet.
        </p>
      )}
      {selectedId && (
        <PrivateDraftEditor
          key={selectedId}
          id={selectedId}
          role={role}
          requestHref={requestHref}
          onClose={() => select(null)}
          onSaved={(saved) =>
            setDrafts((current) =>
              current.map((row) => (row.id === saved.id ? saved : row)),
            )
          }
          onSubmitted={onSubmitted}
        />
      )}
      <div className="space-y-4">
        {drafts.map((draft) => (
          <article
            key={draft.id}
            className="min-w-0 space-y-3 break-words border border-rule bg-surface p-4 [overflow-wrap:anywhere]"
          >
            <header>
              <h3 className="text-lg font-semibold">
                {draft.fields.title ?? "Untitled proposal"}
              </h3>
              <p className="text-xs text-ink-500">
                {draft.status === "submitted" ? "Submitted" : "Private"} ·
                version {draft.version} · Saved {draft.createdAt}
              </p>
            </header>
            <p className="text-sm">
              {draft.missingFields.length
                ? `${draft.missingFields.length} fields need information: ${draft.missingFields.map((k) => labels[k]).join(", ")}.`
                : "All proposal fields are supplied. Check evidence and manual attribution; planner scheduling and safety review is still required."}
            </p>
            <ProposalEvidence
              proposal={draft}
              manualFields={draft.manualFields}
            />
            <button
              className={button}
              disabled={busy || selectedId !== null}
              onClick={() => select(draft.id)}
            >
              {draft.status === "submitted"
                ? "Review submitted proposal"
                : "Review private draft"}
            </button>
            <p className="text-xs text-ink-500">
              Confidence estimates do not determine feasibility or replace
              planner review.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
