// @vitest-environment node
import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { connect } from "@/lib/db/client";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import {
  dispatchNotification,
  getNotification,
  retryNotification,
} from "@/lib/notifications/service";
import type { NotificationDelivery } from "@railplan/core/types/notifications";
import type { sendTelegramMessage } from "@/lib/notifications/telegram";

const sql = connect();
afterAll(() => sql.end({ timeout: 1 }));

describe("notification claims across independent connections", () => {
  it("serializes overlapping dispatches into one attempt and one provider call, then never resends confirmed success", async () => {
    const actorId = randomUUID(),
      orgId = randomUUID();
    const identity = { id: actorId } as VerifiedIdentity;
    let deliveryId: string | undefined;
    let fixtureCommitted = false;
    let inFlight:
      Promise<PromiseSettledResult<NotificationDelivery>[]> | undefined;
    const send = vi
      .fn<typeof sendTelegramMessage>()
      .mockResolvedValue({ ok: true, messageId: "123" });
    try {
      await sql.begin(async (tx) => {
        await tx`insert into auth.users(id) values(${actorId})`;
        await tx`insert into public.profiles(id,role) values(${actorId},'planner')`;
        await tx`insert into public.contractor_organisations(id,name) values(${orgId},'Isolated notification concurrency fixture')`;
        await withAuthenticatedTransaction(
          identity,
          async (scoped) => {
            await scoped`select railplan_private.configure_notification(${orgId}::uuid,0,'-1001234567890')`;
            const [{ result }] = await scoped<
              { result: { id: string } }[]
            >`select railplan_private.queue_notification_test(${orgId}::uuid,1) as result`;
            deliveryId = result.id;
          },
          tx,
        );
      });
      fixtureCommitted = true;
      let release!: () => void, locked!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const acquired = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const blocker = sql.begin(async (tx) => {
        await tx`select id from railplan_private.notification_deliveries where id=${deliveryId!} for update`;
        locked();
        await gate;
      });
      await acquired;
      inFlight = Promise.allSettled([
        dispatchNotification(identity, deliveryId!, { send }),
        dispatchNotification(identity, deliveryId!, { send }),
      ]);
      let waiters = 0;
      try {
        const deadline = Date.now() + 5000;
        while (waiters < 2 && Date.now() < deadline) {
          const [row] = await sql<
            { count: number }[]
          >`select count(*)::integer as count from pg_stat_activity where wait_event_type='Lock' and query like '%claim_notification%'`;
          waiters = row.count;
          if (waiters < 2)
            await new Promise((resolve) => setTimeout(resolve, 30));
        }
      } finally {
        release();
        await blocker;
      }
      const outcomes = await inFlight;
      expect(waiters).toBeGreaterThanOrEqual(2);
      for (const result of outcomes) {
        if (result.status === "rejected") throw result.reason;
      }
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toMatchObject({ chatId: "-1001234567890" });
      const saved = await getNotification(identity, deliveryId!);
      expect(saved).toMatchObject({
        status: "sent",
        telegramMessageId: "123",
        attemptCount: 1,
        inFlight: false,
        ambiguous: false,
      });
      expect(saved.attempts).toHaveLength(1);
      expect(saved.attempts[0]).toMatchObject({
        number: 1,
        actorId,
        chatId: "-1001234567890",
        status: "sent",
      });
      await retryNotification(
        identity,
        deliveryId!,
        { acknowledgeDuplicateRisk: true },
        { send },
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect((await getNotification(identity, deliveryId!)).attemptCount).toBe(
        1,
      );
    } finally {
      await inFlight;
      // Cross-session fixtures must commit to be visible. Delete only the exact
      // generated organisation, restoring every append-only guard atomically.
      if (fixtureCommitted)
        await sql.begin(async (tx) => {
          await tx`set local lock_timeout='5s'`;
          const history = [
            "notification_configuration_events",
            "notification_deliveries",
            "notification_attempts",
            "notification_results",
          ];
          for (const table of [
            ...history,
            "notification_configurations",
          ].sort())
            await tx`lock table ${tx("railplan_private." + table)} in access exclusive mode`;
          for (const table of history)
            await tx`alter table ${tx("railplan_private." + table)} disable trigger immutable_notification_history`;
          await tx`delete from railplan_private.notification_results where attempt_id in(select a.id from railplan_private.notification_attempts a join railplan_private.notification_deliveries d on d.id=a.delivery_id where d.organisation_id=${orgId})`;
          await tx`delete from railplan_private.notification_attempts where delivery_id in(select id from railplan_private.notification_deliveries where organisation_id=${orgId})`;
          await tx`delete from railplan_private.notification_deliveries where organisation_id=${orgId}`;
          await tx`delete from railplan_private.notification_configuration_events where organisation_id=${orgId}`;
          await tx`delete from railplan_private.notification_configurations where organisation_id=${orgId}`;
          for (const table of history)
            await tx`alter table ${tx("railplan_private." + table)} enable trigger immutable_notification_history`;
          await tx`delete from public.contractor_organisations where id=${orgId}`;
          await tx`delete from auth.users where id=${actorId}`;
        });
    }
  }, 30000);
});
