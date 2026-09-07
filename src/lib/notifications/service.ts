import type { TransactionSql } from "postgres";
import type {
  NotificationAttempt,
  NotificationConfiguration,
  NotificationDelivery,
} from "@railplan/core/types/notifications";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import { requireAction } from "@/lib/auth/permissions";
import type { Sql } from "@/lib/db/client";
import {
  configurationSchema,
  retrySchema,
  testConfigurationSchema,
  type ConfigurationInput,
} from "./schemas";
import { sendTelegramMessage, type TelegramResult } from "./telegram";

type Connection = Sql | TransactionSql;
export class NotificationError extends Error {
  constructor(public code: string) {
    super(
      messages[code] ?? "The notification operation could not be completed.",
    );
  }
}
const messages: Record<string, string> = {
  not_found: "This notification or organisation does not exist.",
  conflict: "The configuration changed. Reload before saving or testing.",
  invalid_request: "The notification request contains invalid fields.",
  superseded_plan:
    "This plan was superseded. Its unsent notification cannot be delivered.",
  delivery_in_progress:
    "A delivery attempt is still in progress. Reload its status before retrying.",
  duplicate_risk:
    "The previous delivery outcome is unknown. Check the chat and acknowledge the risk of a duplicate before retrying.",
  retry_later:
    "Telegram requested a delay. Wait until the displayed retry time.",
  attempt_limit: "This delivery reached the 20-attempt limit.",
  configuration_changed:
    "The test destination changed. Send a new test for the saved configuration.",
  missing_chat:
    "No Telegram chat is configured for this organisation. Save a destination before retrying.",
  missing_credentials:
    "Telegram bot credentials are missing or invalid. Configure the server token before retrying.",
  invalid_chat:
    "The Telegram destination is invalid. Correct the configuration before retrying.",
  invalid_message:
    "The message exceeds Telegram's 4096-character limit or is empty. No message was sent; request coverage was not truncated.",
  rejected:
    "Telegram rejected the delivery. Check the bot's access and the configured destination.",
  rate_limited:
    "Telegram rate-limited this delivery. Wait until the retry time, then retry explicitly.",
  unavailable:
    "Telegram is unavailable. Retry explicitly after checking the destination.",
  ambiguous:
    "Telegram delivery could not be confirmed. It may have arrived. Check the chat before retrying; a retry could send a duplicate.",
  storage_unavailable:
    "Notification storage is unavailable. Reload delivery status before retrying.",
};
function fail(result: { error?: string }) {
  if (result.error) throw new NotificationError(result.error);
}
function transaction<T>(
  identity: VerifiedIdentity,
  work: (tx: TransactionSql) => Promise<T>,
  connection?: Connection,
): Promise<T> {
  return withAuthenticatedTransaction(
    identity,
    (tx, actor) => {
      requireAction(actor, "publish");
      return work(tx);
    },
    connection,
  );
}
interface DeliveryRow {
  id: string;
  organisation_id: string;
  organisation_name: string;
  plan_id: string | null;
  planning_night: string | null;
  kind: "publication" | "test";
  configuration_version: number | null;
  message_text: string;
  deduplication_key: string;
  created_at: Date;
  superseded: boolean;
  server_now: Date;
}
interface AttemptRow {
  id: string;
  delivery_id: string;
  attempt_number: number;
  actor_id: string;
  chat_id: string | null;
  started_at: Date;
  finished_at: Date | null;
  telegram_message_id: string | null;
  error_code: string | null;
  ambiguous: boolean | null;
  retry_after_seconds: number | null;
}
async function readMany(
  tx: TransactionSql,
  ids: string[],
): Promise<NotificationDelivery[]> {
  if (!ids.length) return [];
  const rows = await tx<
    DeliveryRow[]
  >`select d.*,d.planning_night::text,o.name as organisation_name,clock_timestamp() as server_now,
 exists(select 1 from railplan_private.plan_publications where supersedes=d.plan_id) as superseded
 from railplan_private.notification_deliveries d join public.contractor_organisations o on o.id=d.organisation_id
 where d.id in ${tx(ids)} order by d.created_at,d.id`;
  const attempts = await tx<
    AttemptRow[]
  >`select a.*,r.finished_at,r.telegram_message_id,r.error_code,r.ambiguous,r.retry_after_seconds
 from railplan_private.notification_attempts a left join railplan_private.notification_results r on r.attempt_id=a.id
 where a.delivery_id in ${tx(ids)} order by a.attempt_number`;
  return rows.map((row) => {
    const own = attempts.filter((a) => a.delivery_id === row.id),
      latest = own.at(-1),
      sent = own.findLast((a) => a.telegram_message_id !== null);
    const expired = Boolean(
      latest &&
        !latest.finished_at &&
        row.server_now.getTime() - latest.started_at.getTime() >= 60_000,
    );
    const inFlight = Boolean(
      !sent && latest && !latest.finished_at && !expired,
    );
    const ambiguous = Boolean(!sent && (expired || latest?.ambiguous));
    const code = sent
      ? null
      : row.superseded
        ? "superseded_plan"
        : expired
          ? "ambiguous"
          : (latest?.error_code ?? null);
    return {
      id: row.id,
      organisationId: row.organisation_id,
      organisationName: row.organisation_name,
      planId: row.plan_id,
      planningNight: row.planning_night,
      kind: row.kind,
      messageText: row.message_text,
      deduplicationKey: row.deduplication_key,
      status: sent ? "sent" : code ? "failed" : "pending",
      ambiguous,
      inFlight,
      attemptCount: own.length,
      telegramMessageId: sent?.telegram_message_id ?? null,
      errorCode: code,
      errorMessage: code ? (messages[code] ?? messages.ambiguous) : null,
      nextRetryAt:
        latest?.finished_at && latest.retry_after_seconds !== null
          ? new Date(
              latest.finished_at.getTime() + latest.retry_after_seconds * 1000,
            ).toISOString()
          : null,
      createdAt: row.created_at.toISOString(),
      lastAttemptAt: latest?.started_at.toISOString() ?? null,
      sentAt: sent?.finished_at?.toISOString() ?? null,
      attempts: own.map((a): NotificationAttempt => {
        const unknown =
          !a.finished_at &&
          row.server_now.getTime() - a.started_at.getTime() >= 60_000;
        const errorCode = unknown ? "ambiguous" : a.error_code;
        return {
          id: a.id,
          number: a.attempt_number,
          actorId: a.actor_id,
          chatId: a.chat_id,
          startedAt: a.started_at.toISOString(),
          finishedAt: a.finished_at?.toISOString() ?? null,
          status: a.telegram_message_id
            ? "sent"
            : unknown
              ? "unknown"
              : a.finished_at
                ? "failed"
                : "sending",
          telegramMessageId: a.telegram_message_id,
          errorCode,
          errorMessage: errorCode
            ? (messages[errorCode] ?? messages.ambiguous)
            : null,
          ambiguous: unknown || Boolean(a.ambiguous),
        };
      }),
    };
  });
}
export async function getNotification(
  identity: VerifiedIdentity,
  id: string,
  connection?: Connection,
): Promise<NotificationDelivery> {
  return transaction(
    identity,
    async (tx) => {
      const [row] = await readMany(tx, [id]);
      if (!row) throw new NotificationError("not_found");
      return row;
    },
    connection,
  );
}
export async function listPlanNotifications(
  identity: VerifiedIdentity,
  planId: string,
  connection?: Connection,
): Promise<NotificationDelivery[]> {
  return transaction(
    identity,
    async (tx) => {
      if (
        !(
          await tx`select 1 from railplan_private.planning_runs where id=${planId}`
        ).length
      )
        throw new NotificationError("not_found");
      const rows = await tx<
        { id: string }[]
      >`select id from railplan_private.notification_deliveries where plan_id=${planId} order by organisation_id`;
      return readMany(
        tx,
        rows.map((r) => r.id),
      );
    },
    connection,
  );
}
async function configurations(
  tx: TransactionSql,
  organisationId?: string,
): Promise<NotificationConfiguration[]> {
  const rows = await tx<
    {
      organisation_id: string;
      name: string;
      chat_id: string | null;
      version: number | null;
      updated_by: string | null;
      updated_at: Date | null;
      test_id: string | null;
    }[]
  >`
 select o.id as organisation_id,o.name,c.chat_id,c.version,c.updated_by,c.updated_at,
 (select d.id from railplan_private.notification_deliveries d where d.organisation_id=o.id and d.kind='test' and d.configuration_version=coalesce(c.version,0) order by d.created_at desc limit 1) as test_id
 from public.contractor_organisations o left join railplan_private.notification_configurations c on c.organisation_id=o.id
 where (${organisationId ?? null}::uuid is null or o.id=${organisationId ?? null}::uuid) order by o.name,o.id limit 500`;
  const tests = await readMany(
    tx,
    rows.flatMap((r) => (r.test_id ? [r.test_id] : [])),
  );
  return rows.map((r) => ({
    organisationId: r.organisation_id,
    organisationName: r.name,
    chatId: r.chat_id,
    version: r.version ?? 0,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at?.toISOString() ?? null,
    lastTest: tests.find((t) => t.id === r.test_id) ?? null,
  }));
}
export async function listNotificationConfigurations(
  identity: VerifiedIdentity,
  connection?: Connection,
): Promise<NotificationConfiguration[]> {
  return transaction(identity, (tx) => configurations(tx), connection);
}
export async function configureNotification(
  identity: VerifiedIdentity,
  organisationId: string,
  raw: ConfigurationInput,
  connection?: Connection,
): Promise<NotificationConfiguration> {
  const input = configurationSchema.parse(raw);
  return transaction(
    identity,
    async (tx) => {
      const [{ result }] = await tx<
        { result: { error?: string } }[]
      >`select railplan_private.configure_notification(${organisationId}::uuid,${input.expectedVersion},${input.chatId}) as result`;
      fail(result);
      return (await configurations(tx, organisationId))[0];
    },
    connection,
  );
}
export interface NotificationOptions {
  connection?: Connection;
  /** Only tests inject a transport. No connection injection may call the real provider. */
  send?: typeof sendTelegramMessage;
  retry?: boolean;
  acknowledgeDuplicateRisk?: boolean;
}
export async function dispatchNotification(
  identity: VerifiedIdentity,
  id: string,
  options: NotificationOptions = {},
): Promise<NotificationDelivery> {
  if (options.connection && !options.send)
    throw new Error(
      "A fake sender is required for transaction-injected delivery tests.",
    );
  const claim = await transaction(
    identity,
    async (tx) => {
      const [{ result }] = await tx<
        {
          result: {
            error?: string;
            skip?: boolean;
            claimId?: string;
            chatId?: string | null;
            text?: string;
          };
        }[]
      >`select railplan_private.claim_notification(${id}::uuid,${options.retry ?? false},${options.acknowledgeDuplicateRisk ?? false}) as result`;
      fail(result);
      return result;
    },
    options.connection,
  );
  if (claim.skip) return getNotification(identity, id, options.connection);
  let result:
    | TelegramResult
    | { ok: false; code: "missing_chat"; ambiguous: false };
  if (!claim.chatId)
    result = { ok: false, code: "missing_chat", ambiguous: false };
  else
    try {
      result = await (options.send ?? sendTelegramMessage)({
        chatId: claim.chatId,
        text: claim.text!,
      });
    } catch {
      result = {
        ok: false,
        code: "ambiguous",
        ambiguous: true,
        message: messages.ambiguous,
      };
    }
  // A failure to save a provider result leaves a durable claim. It becomes
  // visibly unknown after 60 seconds; never automatically send that claim again.
  try {
    await transaction(
      identity,
      async (tx) => {
        await tx`select railplan_private.finish_notification(${claim.claimId!}::uuid,${result.ok ? result.messageId : null},${result.ok ? null : result.code},${result.ok ? false : result.ambiguous},${!result.ok && "retryAfterSeconds" in result ? (result.retryAfterSeconds ?? null) : null})`;
      },
      options.connection,
    );
  } catch {
    throw new NotificationError("storage_unavailable");
  }
  return getNotification(identity, id, options.connection);
}
export async function testNotificationConfiguration(
  identity: VerifiedIdentity,
  organisationId: string,
  raw: unknown,
  options: NotificationOptions = {},
): Promise<NotificationDelivery> {
  const input = testConfigurationSchema.parse(raw);
  const id = await transaction(
    identity,
    async (tx) => {
      const [{ result }] = await tx<
        { result: { id: string; error?: string } }[]
      >`select railplan_private.queue_notification_test(${organisationId}::uuid,${input.expectedVersion}) as result`;
      fail(result);
      return result.id;
    },
    options.connection,
  );
  return dispatchNotification(identity, id, options);
}
export async function retryNotification(
  identity: VerifiedIdentity,
  id: string,
  raw: unknown,
  options: NotificationOptions = {},
): Promise<NotificationDelivery> {
  const input = retrySchema.parse(raw);
  return dispatchNotification(identity, id, {
    ...options,
    retry: true,
    acknowledgeDuplicateRisk: input.acknowledgeDuplicateRisk,
  });
}
/** Start at most eight sends at once, and no new send after the 16-second budget.
 * Each transport has its own eight-second ceiling. Unstarted outbox rows remain
 * pending and are recoverable by an explicit planner action. */
export async function dispatchPlanNotifications(
  identity: VerifiedIdentity,
  planId: string,
): Promise<void> {
  const deliveries = await listPlanNotifications(identity, planId);
  const deadline = Date.now() + 16_000;
  let next = 0,
    failed = false;
  await Promise.all(
    Array.from({ length: Math.min(8, deliveries.length) }, async () => {
      while (next < deliveries.length && Date.now() < deadline) {
        const delivery = deliveries[next++];
        if (delivery.attemptCount || delivery.status === "sent") continue;
        try {
          await dispatchNotification(identity, delivery.id);
        } catch {
          failed = true;
        }
      }
    }),
  );
  if (failed) throw new NotificationError("storage_unavailable");
}
