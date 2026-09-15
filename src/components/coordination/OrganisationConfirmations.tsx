"use client";

import { useRef, useState } from "react";
import type {
  CoordinationCase,
  OrganisationConfirmation,
} from "@railplan/core/types/coordination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUnsavedChanges } from "@/lib/navigation/useUnsavedChanges";

type Action = Record<string, unknown> & { action: string };

const statusLabel: Record<OrganisationConfirmation["status"], string> = {
  pending: "Pending organisation approval",
  approved: "Organisation approved",
  "changes-requested": "Changes requested",
};

function localTimestamp(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 16);
}

export function OrganisationConfirmations({
  coordinationCase,
  role,
  organisationNames,
  disabled = false,
  readOnly = false,
  onAction,
}: {
  coordinationCase: CoordinationCase;
  role: "planner" | "contractor";
  organisationNames?: ReadonlyMap<string, string>;
  disabled?: boolean;
  readOnly?: boolean;
  onAction: (action: Action) => Promise<void>;
}) {
  const [dialog, setDialog] = useState<{
    kind: "approve" | "request-changes";
    organisationId?: string;
  } | null>(null);
  const [note, setNote] = useState("");
  const [confirmedAt, setConfirmedAt] = useState(localTimestamp);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  useUnsavedChanges(!!dialog && !!note.trim());

  const open = (
    kind: "approve" | "request-changes",
    organisationId?: string,
  ) => {
    opener.current = document.activeElement as HTMLElement | null;
    setDialog({ kind, organisationId });
    setError("");
  };
  const close = () => {
    if (saving) return;
    setDialog(null);
    setNote("");
    setError("");
  };
  const submit = async () => {
    if (!dialog || !note.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (dialog.kind === "approve") {
        await onAction({
          action: "approve",
          expectedVersion: coordinationCase.version,
          revision: coordinationCase.viewedRevision,
          organisationId: dialog.organisationId,
          confirmedAt: new Date(`${confirmedAt}:00+08:00`).toISOString(),
          note: note.trim(),
        });
      } else {
        await onAction({
          action: "request-changes",
          expectedVersion: coordinationCase.version,
          revision: coordinationCase.viewedRevision,
          note: note.trim(),
        });
      }
      setDialog(null);
      setNote("");
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The confirmation could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const hasOperatorWork = coordinationCase.changes.some(
    (change) => change.organisationId === null,
  );
  return (
    <section className="space-y-3" aria-label="Organisation confirmations">
      <div>
        <h3 className="font-semibold">Organisation confirmations</h3>
        <p className="planner-muted text-sm">
          Organisation confirmation does not replace safety or publication
          approval.
        </p>
      </div>
      {hasOperatorWork && (
        <p className="rounded border border-rule bg-surface p-3 text-sm">
          Operator-owned work — no contractor approval applicable
        </p>
      )}
      {coordinationCase.confirmations.map((confirmation) => (
        <article
          className="rounded border border-rule bg-surface p-3"
          key={`${confirmation.organisationId}-${confirmation.revision}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">
                {role === "contractor"
                  ? "Your organisation"
                  : (organisationNames?.get(confirmation.organisationId) ??
                    `Organisation ${confirmation.organisationId.slice(0, 8)}`)}
              </p>
              <p>{statusLabel[confirmation.status]}</p>
              <p className="planner-muted text-xs">
                Proposal revision {confirmation.revision}
                {confirmation.confirmedAt
                  ? ` · Recorded ${new Date(confirmation.confirmedAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })} SGT`
                  : ""}
              </p>
            </div>
            {role === "planner" && !readOnly &&
              confirmation.revision === coordinationCase.currentRevision && (
                <button
                  type="button"
                  className="planner-button"
                  disabled={disabled || saving}
                  onClick={() => open("approve", confirmation.organisationId)}
                >
                  Mark organisation approved
                </button>
              )}
          </div>
        </article>
      ))}
      {role === "contractor" && !readOnly && coordinationCase.confirmations.length > 0 && (
        <button
          type="button"
          className="planner-button"
          disabled={disabled || saving || coordinationCase.state === "closed"}
          onClick={() => open("request-changes")}
        >
          Request changes
        </button>
      )}
      <Dialog open={!!dialog} onOpenChange={(next) => !next && close()}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          onEscapeKeyDown={(event) => saving && event.preventDefault()}
        >
          <DialogTitle>
            {dialog?.kind === "approve"
              ? "Mark organisation approved"
              : "Request coordination changes"}
          </DialogTitle>
          <DialogDescription>
            This records an audited response for proposal revision {coordinationCase.viewedRevision}.
          </DialogDescription>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {dialog?.kind === "approve" && (
              <>
                <p className="font-medium">
                  {dialog.organisationId
                    ? (organisationNames?.get(dialog.organisationId) ??
                      `Organisation ${dialog.organisationId.slice(0, 8)}`)
                    : "Organisation"}
                </p>
                <label className="block text-sm">
                  Confirmation time (SGT)
                  <input
                    aria-label="Confirmation time"
                    className="planner-field mt-1 block w-full"
                    type="datetime-local"
                    required
                    disabled={saving}
                    value={confirmedAt}
                    onChange={(event) => setConfirmedAt(event.target.value)}
                  />
                </label>
              </>
            )}
            <label className="block text-sm">
              {dialog?.kind === "approve"
                ? "Confirmation note"
                : "Requested changes note"}
              <textarea
                aria-label={
                  dialog?.kind === "approve"
                    ? "Confirmation note"
                    : "Requested changes note"
                }
                className="planner-field mt-1 min-h-24 w-full"
                required
                maxLength={1000}
                disabled={saving}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <button
              className="planner-button primary"
              type="submit"
              disabled={saving || !note.trim() || !confirmedAt}
            >
              {saving
                ? "Saving…"
                : dialog?.kind === "approve"
                  ? "Save organisation approval"
                  : "Send request for changes"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
