"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Mount with the saved version ID as its key: switching versions aborts a
 * pending download, so a late response cannot masquerade as the new selection. */
export function SavedPlanExports({
  planId,
  disabled = false,
}: {
  planId: string;
  disabled?: boolean;
}) {
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => () => active.current?.abort(), []);

  async function download(format: "json" | "csv") {
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/plans/${encodeURIComponent(planId)}/export?format=${format}`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (!controller.signal.aborted)
          setError(
            body?.error?.message ??
              "Unable to download this saved plan. Try again.",
          );
        return;
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const urls = URL;
      const url = urls.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `railplan-${planId.toLowerCase()}.${format}`;
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        // Allow the browser to consume the URL before releasing its backing data.
        setTimeout(() => urls.revokeObjectURL(url), 1000);
      }
      setNotice(
        `${format.toUpperCase()} download started. Review the status and prototype notices in the file.`,
      );
    } catch {
      if (!controller.signal.aborted)
        setError(
          "Unable to download this saved plan. Check your connection and try again.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section
      aria-label="Export saved plan"
      className="space-y-3 rounded border border-rule bg-surface p-4"
    >
      <h3 className="font-semibold">Export this saved version</h3>
      <p className="text-sm text-ink-700">
        Files preserve the saved schedule and calculations, with provenance and
        current source/publication status. Every export is a non-operational
        prototype artifact.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={disabled || busy}
          onClick={() => void download("json")}
        >
          Download JSON
        </Button>
        <Button
          disabled={disabled || busy}
          onClick={() => void download("csv")}
        >
          Download CSV
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-signal-red">
          {error}
        </p>
      )}
      <p role="status" aria-label="Export status" className="text-sm">
        {busy ? "Preparing the saved export…" : notice}
      </p>
    </section>
  );
}
