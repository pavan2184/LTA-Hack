"use client";

import { useEffect, useState } from "react";
import type { RequestSubmission } from "@railplan/core/types/requests";
import { formatClock } from "@railplan/core/engine/intervals";

/**
 * What the contractors said about the published version. A publication that
 * nobody confirmed is a message, not a schedule; this is where the planner sees
 * which times are agreed, which cannot be kept, and who has not answered.
 */
export function ContractorResponses({ planId }: { planId: string }) {
  const [requests, setRequests] = useState<RequestSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/requests", { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(data?.requests))
          throw new Error(data?.error?.message ?? "Contractor responses could not be loaded.");
        if (active) {
          setRequests(data.requests);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Contractor responses could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [planId, refresh]);

  const rows = requests
    .filter((r) => r.scheduled?.planId === planId)
    .sort((a, b) => a.scheduled!.startMinute - b.scheduled!.startMinute);
  const confirmed = rows.filter((r) => r.scheduled!.acknowledgement?.kind === "confirmed");
  const cannot = rows.filter((r) => r.scheduled!.acknowledgement?.kind === "cannot_comply");
  const awaiting = rows.filter((r) => !r.scheduled!.acknowledgement);

  return (
    <section aria-label="Contractor responses" className="space-y-3 rounded border border-rule bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Contractor responses</h3>
        <button
          className="rounded border border-rule-strong px-2 py-1 text-sm hover:bg-sunk disabled:opacity-50"
          disabled={loading}
          onClick={() => { setLoading(true); setRefresh((n) => n + 1); }}
        >
          Refresh responses
        </button>
      </div>
      {loading && <p role="status" className="text-sm">Loading contractor responses…</p>}
      {error && <p role="alert" className="text-sm text-signal-red">{error}</p>}
      {!loading && !error && !rows.length && (
        <p className="text-sm text-ink-700">
          No contractor work is scheduled in this version, so there is nothing to confirm.
        </p>
      )}
      {rows.length > 0 && (
        <p className="text-sm" role="status" aria-label="Response summary">
          <span className="font-medium text-signal-green">{confirmed.length} confirmed</span> ·{" "}
          <span className={cannot.length ? "font-medium text-signal-amber" : ""}>{cannot.length} cannot make the time</span> ·{" "}
          <span>{awaiting.length} awaiting an answer</span>
        </p>
      )}
      {cannot.length > 0 && (
        <ul aria-label="Times contractors cannot make" className="space-y-2">
          {cannot.map((r) => (
            <li key={r.id} className="border-l-4 border-signal-amber pl-3 text-sm">
              <p className="font-medium">
                {r.fields.title} · {r.organisationName} · {formatClock(r.scheduled!.startMinute)}–{formatClock(r.scheduled!.endMinute)}
              </p>
              <p className="text-ink-700">{r.scheduled!.acknowledgement!.reason}</p>
              <p className="text-xs text-ink-500">
                Requested {formatClock(r.fields.preferredStart)}. Revise the schedule or ask the contractor to revise the request.
              </p>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer">All scheduled contractor work ({rows.length})</summary>
          <ul className="mt-2 divide-y divide-rule">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span>
                  {r.fields.title} · {r.organisationName} · {formatClock(r.scheduled!.startMinute)}–{formatClock(r.scheduled!.endMinute)}
                </span>
                <span className="text-ink-700">
                  {r.scheduled!.acknowledgement
                    ? r.scheduled!.acknowledgement.kind === "confirmed"
                      ? "Confirmed"
                      : "Cannot make it"
                    : "Awaiting"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
