"use client";
import { useState } from "react";
import type { NotificationDelivery } from "@railplan/core/types/notifications";
import { notificationRequest } from "./notification-api";
export const notificationButton =
  "rounded border border-rule-strong px-3 py-2 text-sm hover:bg-sunk disabled:opacity-50";

export function DeliveryRecord({
  delivery,
  allowRetry = false,
  onUpdated,
}: {
  delivery: NotificationDelivery;
  allowRetry?: boolean;
  onUpdated?: (delivery: NotificationDelivery) => void;
}) {
  const [loadedAt] = useState(() => Date.now());
  const retryDelayed =
    delivery.nextRetryAt !== null &&
    Date.parse(delivery.nextRetryAt) > loadedAt;
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canRetry =
    allowRetry &&
    delivery.status !== "sent" &&
    !delivery.inFlight &&
    delivery.errorCode !== "superseded_plan";
  async function retry() {
    if (!canRetry || retryDelayed || (delivery.ambiguous && !acknowledged))
      return;
    setBusy(true);
    setError("");
    try {
      const result = await notificationRequest<{
        delivery: NotificationDelivery;
      }>(
        `/api/notifications/${delivery.id}/retry`,
        delivery.ambiguous ? { acknowledgeDuplicateRisk: true } : {},
      );
      onUpdated?.(result.delivery);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Retry failed. Refresh to check delivery status.",
      );
    } finally {
      setBusy(false);
      setAcknowledged(false);
    }
  }
  return (
    <article
      aria-label={`Delivery for ${delivery.organisationName}`}
      className="min-w-0 space-y-3 break-words rounded border border-rule p-3 [overflow-wrap:anywhere]"
    >
      <header>
        <h4 className="font-semibold">{delivery.organisationName}</h4>
        <p className="text-sm">
          {delivery.kind === "test" ? "Test message" : "Publication message"} ·
          Status: {delivery.status} · Attempts: {delivery.attemptCount}
        </p>
      </header>
      {delivery.inFlight && (
        <p className="text-sm">
          Delivery attempt in progress. Refresh before taking another action.
        </p>
      )}
      {delivery.ambiguous && (
        <p className="border-l-4 border-signal-amber pl-2 text-sm">
          Delivery outcome is unknown. Telegram may have received this message;
          retrying may send it again.
        </p>
      )}
      {delivery.errorMessage && (
        <p className="text-sm text-signal-red">{delivery.errorMessage}</p>
      )}
      {delivery.errorCode && (
        <p className="text-xs text-ink-500">Error: {delivery.errorCode}</p>
      )}
      {delivery.telegramMessageId && (
        <p className="text-sm">
          Telegram message ID: {delivery.telegramMessageId}
        </p>
      )}
      <p className="text-xs text-ink-500">
        Created {delivery.createdAt}
        {delivery.sentAt ? ` · Sent ${delivery.sentAt}` : ""}
        {delivery.lastAttemptAt
          ? ` · Last attempt ${delivery.lastAttemptAt}`
          : ""}
      </p>
      {delivery.nextRetryAt && (
        <p className="text-sm">
          Retry available after {delivery.nextRetryAt}. Refresh delivery status
          when that time has passed.
        </p>
      )}
      <div>
        <h5 className="text-xs font-semibold">Scoped message preview</h5>
        <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-sunk p-3 font-sans text-sm">
          {delivery.messageText}
        </pre>
      </div>
      <details>
        <summary className="cursor-pointer text-sm">
          Delivery attempts ({delivery.attempts.length})
        </summary>
        <ul className="mt-2 space-y-2 text-xs">
          {delivery.attempts.map((attempt) => (
            <li
              key={attempt.id}
              className="space-y-1 border-t border-rule pt-2"
            >
              <p>
                Attempt {attempt.number} · {attempt.status}
                {attempt.ambiguous ? " · outcome unknown" : ""} · Actor{" "}
                {attempt.actorId}
              </p>
              <p>
                Destination {attempt.chatId ?? "Not configured"} · Started{" "}
                {attempt.startedAt} · Finished{" "}
                {attempt.finishedAt ?? "Not recorded"}
              </p>
              {attempt.telegramMessageId && (
                <p>Telegram message ID: {attempt.telegramMessageId}</p>
              )}
              {attempt.errorMessage && <p>{attempt.errorMessage}</p>}
            </li>
          ))}
        </ul>
        {!delivery.attempts.length && (
          <p className="mt-2 text-xs">No recorded attempts.</p>
        )}
        <p className="mt-2 break-all text-xs text-ink-500">
          Delivery {delivery.id} · Deduplication key {delivery.deduplicationKey}
        </p>
      </details>
      {error && (
        <p role="alert" className="text-sm text-signal-red">
          {error}
        </p>
      )}
      {canRetry && (
        <div className="space-y-2">
          {delivery.ambiguous && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={busy}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              I understand retrying may send a duplicate message.
            </label>
          )}
          <button
            className={notificationButton}
            disabled={
              busy || retryDelayed || (delivery.ambiguous && !acknowledged)
            }
            onClick={retry}
          >
            {busy
              ? "Retrying…"
              : delivery.status === "pending"
                ? "Send pending message"
                : "Retry delivery"}
          </button>
        </div>
      )}
    </article>
  );
}
