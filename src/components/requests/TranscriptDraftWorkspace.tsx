"use client";
import { useEffect, useRef, useState } from "react";
import {
  REQUEST_FIELD_KEYS,
  type PrivateDraft,
  type RequestFieldKey,
  type NullableRequestFields,
} from "@railplan/core/types/ingestions";
import {
  decodeTranscriptBytes,
  MAX_TRANSCRIPT_BYTES,
} from "./transcript-input";
const labels: Record<RequestFieldKey, string> = {
  planningNight: "Planning night",
  title: "Title",
  description: "Description",
  workClass: "Work class",
  blockIds: "Track blocks",
  durationMinutes: "Duration",
  preferredStart: "Preferred start",
  earliestStart: "Earliest start",
  latestEnd: "Latest end",
  equipment: "Equipment",
  workforce: "Workforce",
};
const button =
  "rounded border border-rule-strong px-3 py-2 text-sm hover:bg-sunk disabled:opacity-50";
function valueLabel(
  key: RequestFieldKey,
  value: NullableRequestFields[RequestFieldKey],
): string {
  if (value === null) return "Needs information";
  if (Array.isArray(value))
    return (
      value
        .map((v) =>
          typeof v === "string"
            ? v
            : "equipmentId" in v
              ? `${v.equipmentId}: ${v.units} units`
              : `${v.roleId}: ${v.count} people`,
        )
        .join(", ") || "None explicitly stated"
    );
  if (typeof value === "number")
    return `${value} minutes${key === "durationMinutes" ? "" : " after midnight"}`;
  return value;
}
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
}: {
  manualIntake?: boolean;
}) {
  const [drafts, setDrafts] = useState<PrivateDraft[]>([]);
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = loading || saving || readingFile;
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
          Only you can see these private drafts. They are not submitted,
          approved or scheduled.{" "}
          {manualIntake
            ? "Use the manual request form above when extraction is unavailable."
            : "You can continue reviewing submitted requests above when extraction is unavailable."}
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
          <button className={button} onClick={extract}>
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
                Private · version {draft.version} · Saved {draft.createdAt}
              </p>
            </header>
            <p className="text-sm">
              {draft.missingFields.length
                ? `${draft.missingFields.length} fields need information: ${draft.missingFields.map((k) => labels[k]).join(", ")}.`
                : "All proposal fields have supporting evidence. Planner scheduling and safety review is still required."}
            </p>
            <dl className="grid gap-3 md:grid-cols-2">
              {REQUEST_FIELD_KEYS.map((key) => (
                <div
                  key={key}
                  className="min-w-0 rounded border border-rule p-3"
                >
                  <dt className="text-sm font-semibold">{labels[key]}</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm">
                    {valueLabel(key, draft.fields[key])}
                  </dd>
                  {draft.fields[key] !== null &&
                    draft.confidence[key] != null && (
                      <dd className="mt-1 text-xs text-ink-500">
                        {Math.round(draft.confidence[key]! * 100)}% confidence ·
                        model estimate
                      </dd>
                    )}
                  {draft.evidence
                    .filter((e) => e.field === key)
                    .map((e, index) => (
                      <dd key={index} className="mt-2">
                        <blockquote className="border-l-2 border-accent pl-2 text-sm">
                          {e.quote}
                        </blockquote>
                        {e.timestamp && (
                          <p className="mt-1 text-xs text-ink-500">
                            Transcript timestamp: {e.timestamp}
                          </p>
                        )}
                      </dd>
                    ))}
                </div>
              ))}
            </dl>
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
