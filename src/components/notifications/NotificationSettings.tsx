"use client";
import { useEffect, useState } from "react";
import type {
  NotificationConfiguration,
  NotificationDelivery,
} from "@railplan/core/types/notifications";
import { DeliveryRecord, notificationButton } from "./DeliveryRecord";
import { notificationRequest } from "./notification-api";

export function NotificationSettings() {
  const [configurations, setConfigurations] = useState<
    NotificationConfiguration[]
  >([]);
  const [botConfigured, setBotConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    notificationRequest<{
      configurations: NotificationConfiguration[];
      botConfigured: boolean;
    }>("/api/notifications/configurations")
      .then((result) => {
        if (active) {
          setConfigurations(result.configurations);
          setBotConfigured(result.botConfigured);
        }
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Notification settings could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  return (
    <section
      aria-label="Telegram notification settings"
      className="min-w-0 space-y-4 rounded border border-rule bg-surface p-4"
    >
      <h2 className="text-lg font-semibold">Telegram notification settings</h2>
      <p className="text-sm">
        Choose a numeric chat ID for each contractor organisation. Saving a
        destination sends no message. Publishing a plan sends only that
        organisation’s affected work; use Send test message to check a saved
        destination.
      </p>
      <button
        className={notificationButton}
        disabled={loading}
        onClick={() => {
          setLoading(true);
          setError("");
          setConfigurations([]);
          setRefresh((value) => value + 1);
        }}
      >
        Reload settings (discard unsaved edits)
      </button>
      {loading && (
        <p role="status" className="text-sm">
          Loading notification settings…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-signal-red">
          {error}
        </p>
      )}
      {!loading && !error && (
        <>
          {!botConfigured && (
            <p className="border-l-4 border-signal-amber pl-3 text-sm">
              Bot credentials are not configured. Destinations can be saved, but
              Telegram delivery is unavailable until an operator configures the
              server.
            </p>
          )}
          {!configurations.length && (
            <p className="text-sm">
              No contractor organisations are available.
            </p>
          )}
          {configurations.map((configuration) => (
            <ConfigurationCard
              key={`${refresh}:${configuration.organisationId}`}
              initial={configuration}
              botConfigured={botConfigured}
            />
          ))}
        </>
      )}
    </section>
  );
}
function ConfigurationCard({
  initial,
  botConfigured,
}: {
  initial: NotificationConfiguration;
  botConfigured: boolean;
}) {
  const [configuration, setConfiguration] = useState(initial);
  const [chatId, setChatId] = useState(initial.chatId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const normalized = chatId.trim() || null;
  const dirty = normalized !== configuration.chatId;
  async function run(test: boolean) {
    if (
      test &&
      (dirty ||
        !configuration.chatId ||
        !botConfigured ||
        configuration.lastTest?.inFlight)
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (test) {
        const { delivery } = await notificationRequest<{
          delivery: NotificationDelivery;
        }>(
          `/api/notifications/configurations/${configuration.organisationId}/test`,
          { expectedVersion: configuration.version },
        );
        setConfiguration((current) => ({ ...current, lastTest: delivery }));
      } else {
        if (normalized && !/^-?[1-9]\d*$/.test(normalized))
          throw new Error(
            "Enter a numeric Telegram chat ID, or leave it blank to clear the destination.",
          );
        const { configuration: saved } = await notificationRequest<{
          configuration: NotificationConfiguration;
        }>(
          `/api/notifications/configurations/${configuration.organisationId}`,
          { expectedVersion: configuration.version, chatId: normalized },
          "PUT",
        );
        setConfiguration(saved);
        setChatId(saved.chatId ?? "");
        setNotice("Destination saved. No test message was sent.");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The notification configuration could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label={`Telegram for ${configuration.organisationName}`}
      className="min-w-0 space-y-3 rounded border border-rule p-3"
    >
      <h3 className="font-semibold">{configuration.organisationName}</h3>
      <p className="text-xs text-ink-500">
        Version {configuration.version}
        {configuration.updatedAt
          ? ` · Updated ${configuration.updatedAt} by ${configuration.updatedBy}`
          : " · No destination saved"}
      </p>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block text-sm">
          Telegram chat ID
          <input
            type="text"
            inputMode="numeric"
            maxLength={21}
            value={chatId}
            onChange={(event) => {
              setChatId(event.target.value);
              setNotice("");
            }}
            className="mt-1 block w-full max-w-sm rounded border border-rule-strong bg-surface p-2"
          />
        </label>
        <p className="text-xs">
          Use a numeric ID, including the leading minus sign for group chats.
          Blank clears the saved destination.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className={notificationButton}
            disabled={!dirty}
            onClick={() => run(false)}
          >
            Save destination
          </button>
          <button
            className={notificationButton}
            disabled={
              dirty ||
              !configuration.chatId ||
              !botConfigured ||
              configuration.lastTest?.inFlight
            }
            onClick={() => run(true)}
          >
            Send test message
          </button>
        </div>
        {dirty && (
          <p className="text-xs">Save the destination before testing it.</p>
        )}
      </fieldset>
      {busy && (
        <p role="status" className="text-sm">
          Updating notification configuration…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-signal-red">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {configuration.lastTest && (
        <DeliveryRecord
          key={`${configuration.lastTest.id}:${configuration.lastTest.attemptCount}`}
          delivery={configuration.lastTest}
          allowRetry={botConfigured && !dirty && !busy}
          onUpdated={(delivery) =>
            setConfiguration((current) =>
              current.version === configuration.version &&
              current.lastTest?.id === configuration.lastTest?.id
                ? { ...current, lastTest: delivery }
                : current,
            )
          }
        />
      )}
    </section>
  );
}
