"use client";

import { useEffect, useState } from "react";
import type {
  RequestCatalogue,
  RequestSubmission,
  ScheduleAcknowledgement,
} from "@railplan/core/types/requests";

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const button =
  "rounded border border-rule-strong px-3 py-2 text-sm hover:bg-sunk disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      path,
      body === undefined
        ? { cache: "no-store" }
        : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    );
  } catch {
    throw new Error("We could not reach the server. Your answer was not sent; try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const fields = data?.error?.fieldErrors as Record<string, string> | undefined;
    throw new Error(
      (fields && Object.values(fields)[0]) ?? data?.error?.message ?? "The answer could not be sent.",
    );
  }
  return data as T;
}

/**
 * The contractor's side of a published night, in the contractor's words.
 *
 * Each scheduled request shows what was asked for and what was published, and
 * takes one of two answers. "Cannot make this time" needs a reason, because
 * that reason is what the planner acts on. Answers are recorded against the
 * exact published version, so a later version asks again.
 */
export function ContractorSchedule() {
  const [requests, setRequests] = useState<RequestSubmission[]>([]);
  const [catalogue, setCatalogue] = useState<RequestCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ requests: RequestSubmission[] }>("/api/requests"),
      api<{ catalogue: RequestCatalogue }>("/api/requests/catalogue"),
    ])
      .then(([r, c]) => {
        if (!active) return;
        setRequests(r.requests);
        setCatalogue(c.catalogue);
        setError("");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Your schedule could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  const scheduled = requests
    .filter((r) => r.scheduled)
    .sort((a, b) => a.fields.planningNight.localeCompare(b.fields.planningNight) || a.scheduled!.startMinute - b.scheduled!.startMinute);
  const awaiting = scheduled.filter((r) => !r.scheduled!.acknowledgement).length;

  return (
    <section aria-label="Your schedule" className="space-y-3 rounded border border-rule-strong bg-surface p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Your schedule</h2>
          <p className="mt-1 text-sm text-ink-700">
            Published times for your organisation’s work. Confirm each one, or tell the planner you cannot make it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {scheduled.length > 0 && (
            <span className="text-sm" role="status">
              {awaiting ? `${awaiting} of ${scheduled.length} awaiting your answer` : `All ${scheduled.length} answered`}
            </span>
          )}
          <button className={button} disabled={loading} onClick={() => { setLoading(true); setRefresh((n) => n + 1); }}>
            Refresh schedule
          </button>
        </div>
      </header>
      {loading && <p role="status" className="text-sm">Loading your schedule…</p>}
      {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
      {!loading && !error && !scheduled.length && (
        <p className="text-sm text-ink-700">
          No published times yet. When the planner publishes a night that includes your work, the times appear here.
        </p>
      )}
      <ul className="space-y-3">
        {scheduled.map((request) => (
          <ScheduledRequest
            key={`${request.id}:${request.scheduled!.planId}`}
            request={request}
            catalogue={catalogue}
            onAnswered={(updated) =>
              setRequests((current) => current.map((row) => (row.id === updated.id ? updated : row)))
            }
          />
        ))}
      </ul>
    </section>
  );
}

function ScheduledRequest({
  request,
  catalogue,
  onAnswered,
}: {
  request: RequestSubmission;
  catalogue: RequestCatalogue | null;
  onAnswered: (request: RequestSubmission) => void;
}) {
  const scheduled = request.scheduled!;
  const [answering, setAnswering] = useState<"idle" | "cannot" | "change">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const answer = scheduled.acknowledgement;
  const moved = scheduled.startMinute - request.fields.preferredStart;
  const blocks = request.fields.blockIds.map((id) => catalogue?.blocks.find((b) => b.id === id)?.label ?? id);
  const where = blocks.length > 1 ? `${blocks[0]} to ${blocks[blocks.length - 1]}` : blocks[0] ?? "";

  async function send(kind: ScheduleAcknowledgement["kind"]) {
    setBusy(true);
    setError("");
    try {
      const { request: updated } = await api<{ request: RequestSubmission }>(
        `/api/requests/${request.id}/acknowledge`,
        { planId: scheduled.planId, kind, reason: kind === "cannot_comply" ? reason : "" },
      );
      onAnswered(updated);
      setAnswering("idle");
      setReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The answer could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  const showButtons = !answer || answering === "change" || answering === "cannot";
  return (
    <li className="rounded border border-rule p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{request.fields.title || "Untitled work"}</h3>
          <p className="mt-0.5 text-sm text-ink-700">
            Night of {request.fields.planningNight} · {where}
          </p>
          <p className="mt-2 text-sm">
            <span className="font-mono text-base font-semibold">
              {clock(scheduled.startMinute)}–{clock(scheduled.endMinute)}
            </span>{" "}
            <span className="text-ink-700">
              {moved === 0
                ? "as you requested"
                : `${Math.abs(moved)} min ${moved > 0 ? "later" : "earlier"} than you requested (${clock(request.fields.preferredStart)})`}
            </span>
          </p>
        </div>
        <div className="text-right text-sm">
          {answer?.kind === "confirmed" && (
            <p className="font-medium text-signal-green">Confirmed</p>
          )}
          {answer?.kind === "cannot_comply" && (
            <p className="font-medium text-signal-amber">You cannot make this time</p>
          )}
          {!answer && <p className="font-medium text-ink-700">Awaiting your answer</p>}
          {answer && (
            <p className="text-xs text-ink-500">{answer.createdAt.replace("T", " ").slice(0, 16)} UTC</p>
          )}
        </div>
      </div>
      {answer?.kind === "cannot_comply" && answering === "idle" && (
        <p className="mt-2 text-sm text-ink-700">Your reason: {answer.reason}</p>
      )}
      <div className="mt-3 flex flex-wrap items-start gap-2">
        {showButtons && answering !== "cannot" && (
          <>
            <button className={button} disabled={busy} onClick={() => send("confirmed")}>
              Confirm this time
            </button>
            <button className={button} disabled={busy} onClick={() => setAnswering("cannot")}>
              Cannot make this time
            </button>
            {answering === "change" && (
              <button className={button} disabled={busy} onClick={() => setAnswering("idle")}>
                Keep my answer
              </button>
            )}
          </>
        )}
        {answering === "cannot" && (
          <form
            className="w-full space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send("cannot_comply");
            }}
          >
            <label className="block text-sm">
              What prevents this time?
              <textarea
                className="mt-1 block w-full rounded border border-rule-strong bg-surface p-2 text-sm"
                rows={2}
                maxLength={2000}
                required
                value={reason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
                placeholder="For example: our crew starts at 01:00, or the materials arrive at 02:30."
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={button} disabled={busy || !reason.trim()}>
                Send to the planner
              </button>
              <button type="button" className={button} disabled={busy} onClick={() => setAnswering("idle")}>
                Back
              </button>
            </div>
          </form>
        )}
        {answer && answering === "idle" && (
          <button className={button} disabled={busy} onClick={() => setAnswering("change")}>
            Change my answer
          </button>
        )}
      </div>
      {busy && <p role="status" className="mt-2 text-sm">Sending your answer…</p>}
      {error && <p role="alert" className="mt-2 text-sm text-signal-red">{error}</p>}
    </li>
  );
}
