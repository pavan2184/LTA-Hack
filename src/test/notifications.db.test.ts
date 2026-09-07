// @vitest-environment node
import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { connect } from "@/lib/db/client";
import {
  withAuthenticatedTransaction,
  type VerifiedIdentity,
} from "@/lib/auth/session";
import { createRequest, actOnRequest } from "@/lib/requests/service";
import { createPlan, publishPlan } from "@/lib/plans/service";
import {
  configureNotification,
  dispatchNotification,
  getNotification,
  listNotificationConfigurations,
  listPlanNotifications,
  retryNotification,
  testNotificationConfiguration,
} from "@/lib/notifications/service";
import { PLANNING_NIGHT } from "@railplan/core/data/requests";
import type { RequestFields } from "@railplan/core/types/requests";
const sql = connect();
const reachable = await sql`select 1`.then(
  () => true,
  () => false,
);
afterAll(() => sql.end({ timeout: 1 }));
const identity = (id: string) => ({ id }) as VerifiedIdentity;
const rollback = new Error("rollback notification fixtures");
async function fixture(
  work: (
    tx: TransactionSql,
    p: VerifiedIdentity,
    c: VerifiedIdentity,
    other: VerifiedIdentity,
    org: string,
    org2: string,
  ) => Promise<void>,
) {
  await expect(
    sql.begin(async (tx) => {
      const p = randomUUID(),
        c = randomUUID(),
        other = randomUUID(),
        org = randomUUID(),
        org2 = randomUUID();
      await tx`insert into auth.users(id) values(${p}),(${c}),(${other})`;
      await tx`insert into public.contractor_organisations(id,name) values(${org},'Notification fixture'),(${org2},'Other notification fixture')`;
      await tx`insert into public.profiles(id,role,contractor_organisation_id) values(${p},'planner',null),(${c},'contractor',${org}),(${other},'contractor',${org2})`;
      await work(tx, identity(p), identity(c), identity(other), org, org2);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}
const fields: RequestFields = {
  planningNight: PLANNING_NIGHT,
  title: "Notification walkway fixture",
  description: "Fabricated notification test",
  workClass: "civil",
  blockIds: ["NS10-NS11"],
  durationMinutes: 15,
  preferredStart: 0,
  earliestStart: 0,
  latestEnd: 240,
  equipment: [],
  workforce: [{ roleId: "technician", count: 1 }],
};
const approval = {
  teamId: "T-TRK",
  priority: "low" as const,
  clearanceMinutes: 0,
  requiredSkills: [],
  dependencies: [],
  dependencyLagMinutes: 0,
  safetyConfirmed: true as const,
};
const planInput = {
  planningNight: PLANNING_NIGHT,
  strategy: "balanced" as const,
  locked: [],
};
async function approved(
  tx: TransactionSql,
  p: VerifiedIdentity,
  c: VerifiedIdentity,
  f: RequestFields = fields,
) {
  const created = await createRequest(c, { fields: f }, tx);
  const submitted = await actOnRequest(
    c,
    created.id,
    { expectedVersion: created.version, action: "submit", reason: "Fixture" },
    tx,
  );
  return actOnRequest(
    p,
    created.id,
    {
      expectedVersion: submitted.version,
      action: "approve",
      reason: "Fixture approval",
      approval,
    },
    tx,
  );
}
describe.skipIf(!reachable)(
  "durable scoped notifications (rollback)",
  { timeout: 30000 },
  () => {
    it("atomically queues one scoped message, skips unchanged organisations and preserves removed/deferred changes", () =>
      fixture(async (tx, p, c, other, org, org2) => {
        const a = await approved(tx, p, c),
          b = await approved(tx, p, other, {
            ...fields,
            title: "Other organisation work",
            blockIds: ["EW18-EW19"],
          });
        const first = await createPlan(p, planInput, tx);
        await publishPlan(p, first.id, tx);
        const initial = await listPlanNotifications(p, first.id, tx);
        expect(initial).toHaveLength(2);
        for (const delivery of initial) {
          const own = delivery.organisationId === org ? a : b,
            foreign = delivery.organisationId === org ? b : a;
          expect(delivery.messageText).toContain(`R-${own.id}`);
          expect(delivery.messageText).not.toContain(`R-${foreign.id}`);
          expect(delivery.messageText).not.toContain("M-001");
          expect(delivery.messageText).toContain(first.id);
          expect(delivery.messageText).toContain(PLANNING_NIGHT);
          expect(delivery.messageText).toMatch(/Prototype only/);
          expect(delivery.status).toBe("pending");
          expect(delivery.attemptCount).toBe(0);
        }
        await publishPlan(p, first.id, tx);
        expect(await listPlanNotifications(p, first.id, tx)).toHaveLength(2);
        const unchanged = await createPlan(p, planInput, tx);
        await publishPlan(p, unchanged.id, tx);
        expect(await listPlanNotifications(p, unchanged.id, tx)).toHaveLength(
          0,
        );
        await actOnRequest(
          c,
          a.id,
          {
            expectedVersion: a.version,
            action: "cancel",
            reason: "Remove fixture work",
          },
          tx,
        );
        const removed = await createPlan(p, planInput, tx);
        await publishPlan(p, removed.id, tx);
        const notices = await listPlanNotifications(p, removed.id, tx);
        const notice = notices.find((n) => n.organisationId === org)!;
        expect(notice.messageText).toContain(`R-${a.id} | removed`);
        expect(notice.messageText).toContain("NS10-NS11");
        if (
          first.placements.some(
            (placement) => placement.requestId === `R-${a.id}`,
          )
        )
          expect(notice.messageText).toMatch(
            /previous time \d{2}:\d{2}-\d{2}:\d{2}/,
          );
        // The other organisation is included only if removing a changes its own slot.
        const previousB = unchanged.placements.find(
            (x) => x.requestId === `R-${b.id}`,
          ),
          newB = removed.placements.find((x) => x.requestId === `R-${b.id}`);
        if (JSON.stringify(previousB) === JSON.stringify(newB))
          expect(notices.some((n) => n.organisationId === org2)).toBe(false);
        const noStaff = await approved(tx, p, c, {
          ...fields,
          workforce: [{ roleId: "technician", count: 10000 }],
        });
        const deferred = await createPlan(p, planInput, tx);
        await publishPlan(p, deferred.id, tx);
        expect(
          (await listPlanNotifications(p, deferred.id, tx)).find(
            (n) => n.organisationId === org,
          )!.messageText,
        ).toContain(`R-${noStaff.id} | deferred; no assigned time`);
      }));
    it("derives destinations, protects configuration versions and prevents known-success resends", () =>
      fixture(async (tx, p, c, other, org) => {
        const config = await configureNotification(
          p,
          org,
          { expectedVersion: 0, chatId: "-100123" },
          tx,
        );
        expect(config.version).toBe(1);
        await expect(
          configureNotification(
            p,
            org,
            { expectedVersion: 0, chatId: "999" },
            tx,
          ),
        ).rejects.toMatchObject({ code: "conflict" });
        const send = vi.fn(async () => ({
          ok: true as const,
          messageId: "42",
        }));
        const result = await testNotificationConfiguration(
          p,
          org,
          { expectedVersion: 1 },
          { connection: tx, send },
        );
        expect(result).toMatchObject({
          status: "sent",
          telegramMessageId: "42",
          attemptCount: 1,
        });
        expect(send.mock.calls).toHaveLength(1);
        expect(send.mock.calls[0]).toEqual([
          { chatId: "-100123", text: result.messageText },
        ]);
        await retryNotification(p, result.id, {}, { connection: tx, send });
        await testNotificationConfiguration(
          p,
          org,
          { expectedVersion: 1 },
          { connection: tx, send },
        );
        expect(send).toHaveBeenCalledTimes(1);
        expect(
          (await listNotificationConfigurations(p, tx)).find(
            (x) => x.organisationId === org,
          )!.lastTest!.id,
        ).toBe(result.id);
        const changed = await configureNotification(
          p,
          org,
          { expectedVersion: 1, chatId: "-100124" },
          tx,
        );
        expect(changed.lastTest).toBeNull();
        expect(
          (await listNotificationConfigurations(p, tx)).find(
            (x) => x.organisationId === org,
          )!.lastTest,
        ).toBeNull();
        for (const actor of [c, other]) {
          await expect(
            configureNotification(
              actor,
              org,
              { expectedVersion: 1, chatId: "999" },
              tx,
            ),
          ).rejects.toMatchObject({ code: "forbidden" });
          await expect(
            getNotification(actor, result.id, tx),
          ).rejects.toMatchObject({ code: "forbidden" });
          await withAuthenticatedTransaction(
            actor,
            async (db) => {
              expect(
                await db`select * from railplan_private.notification_deliveries`,
              ).toEqual([]);
              expect(
                await db`select * from railplan_private.notification_configurations`,
              ).toEqual([]);
              await expect(
                db.savepoint(
                  (s) =>
                    s`select railplan_private.claim_notification(${result.id}::uuid,true,true)`,
                ),
              ).rejects.toMatchObject({ code: "42501" });
            },
            tx,
          );
        }
        await withAuthenticatedTransaction(
          p,
          async (db) => {
            await expect(
              db.savepoint(
                (s) =>
                  s`update railplan_private.notification_results set telegram_message_id='999'`,
              ),
            ).rejects.toMatchObject({ code: "42501" });
          },
          tx,
        );
      }));
    it("rejects direct owner mutations of every notification history table", () =>
      fixture(async (tx) => {
        for (const table of [
          "notification_configuration_events",
          "notification_deliveries",
          "notification_attempts",
          "notification_results",
        ]) {
          await expect(
            tx.savepoint((db) =>
              db.unsafe(`delete from railplan_private.${table}`),
            ),
          ).rejects.toMatchObject({ code: "42501" });
        }
      }));
    it("keeps provider failures and missing configuration durable with explicit retry and sanitized messages", () =>
      fixture(async (tx, p, _c, _other, org) => {
        const send = vi.fn(async () => ({
          ok: false as const,
          code: "missing_credentials" as const,
          ambiguous: false,
          message: "secret token must never survive",
        }));
        const missing = await testNotificationConfiguration(
          p,
          org,
          { expectedVersion: 0 },
          { connection: tx, send },
        );
        expect(missing.errorCode).toBe("missing_chat");
        expect(send).not.toHaveBeenCalled();
        await configureNotification(
          p,
          org,
          { expectedVersion: 0, chatId: "123" },
          tx,
        );
        const failed = await testNotificationConfiguration(
          p,
          org,
          { expectedVersion: 1 },
          { connection: tx, send },
        );
        expect(failed.status).toBe("failed");
        expect(failed.errorCode).toBe("missing_credentials");
        expect(JSON.stringify(failed)).not.toContain("secret token");
        const outcome = await retryNotification(
          p,
          failed.id,
          {},
          { connection: tx, send: async () => ({ ok: true, messageId: "70" }) },
        );
        expect(outcome).toMatchObject({
          status: "sent",
          attemptCount: 2,
          telegramMessageId: "70",
        });
        expect(outcome.attempts[0]).toMatchObject({
          status: "failed",
          errorCode: "missing_credentials",
        });
        const rows =
          await tx`select * from railplan_private.notification_results`;
        expect(JSON.stringify(rows)).not.toContain("secret token");
      }));
    it("requires acknowledgement for uncertain outcomes and honors explicit 429 retry delay", () =>
      fixture(async (tx, p, _c, _other, org) => {
        await configureNotification(
          p,
          org,
          { expectedVersion: 0, chatId: "123" },
          tx,
        );
        const unknown = await testNotificationConfiguration(
          p,
          org,
          { expectedVersion: 1 },
          {
            connection: tx,
            send: async () => {
              throw new Error("token-bearing URL");
            },
          },
        );
        expect(unknown).toMatchObject({
          status: "failed",
          ambiguous: true,
          errorCode: "ambiguous",
        });
        const send = vi.fn(async () => ({
          ok: true as const,
          messageId: "80",
        }));
        await expect(
          retryNotification(p, unknown.id, {}, { connection: tx, send }),
        ).rejects.toMatchObject({ code: "duplicate_risk" });
        expect(send).not.toHaveBeenCalled();
        const retried = await retryNotification(
          p,
          unknown.id,
          { acknowledgeDuplicateRisk: true },
          { connection: tx, send },
        );
        expect(retried.status).toBe("sent");
        await configureNotification(
          p,
          org,
          { expectedVersion: 1, chatId: "124" },
          tx,
        );
        const limited = await testNotificationConfiguration(
          p,
          org,
          { expectedVersion: 2 },
          {
            connection: tx,
            send: async () => ({
              ok: false,
              code: "rate_limited",
              ambiguous: false,
              message: "unsafe",
              retryAfterSeconds: 60,
            }),
          },
        );
        expect(limited.nextRetryAt).not.toBeNull();
        expect(limited.errorMessage).not.toContain("unsafe");
        await expect(
          retryNotification(p, limited.id, {}, { connection: tx, send }),
        ).rejects.toMatchObject({ code: "retry_later" });
      }));
    it("exposes abandoned claims as unknown and preserves any late successful result forever", () =>
      fixture(async (tx, p, _c, _other, org) => {
        await configureNotification(
          p,
          org,
          { expectedVersion: 0, chatId: "123" },
          tx,
        );
        const [{ result: queued }] =
          await tx`select railplan_private.queue_notification_test(${org}::uuid,1) as result`;
        const [{ result: claim }] =
          await tx`select railplan_private.claim_notification(${queued.id}::uuid,false,false) as result`;
        expect((await getNotification(p, queued.id, tx)).inFlight).toBe(true);
        await expect(
          retryNotification(
            p,
            queued.id,
            { acknowledgeDuplicateRisk: true },
            {
              connection: tx,
              send: async () => ({ ok: true, messageId: "90" }),
            },
          ),
        ).rejects.toMatchObject({ code: "delivery_in_progress" });
        // Controlled owner-only clock fixture, rolled back with the original guard.
        await tx`reset role`;
        await tx`alter table railplan_private.notification_attempts disable trigger immutable_notification_history`;
        await tx`update railplan_private.notification_attempts set started_at=clock_timestamp()-interval '61 seconds' where id=${claim.claimId}`;
        await tx`alter table railplan_private.notification_attempts enable trigger immutable_notification_history`;
        const expired = await getNotification(p, queued.id, tx);
        expect(expired).toMatchObject({
          status: "failed",
          ambiguous: true,
          inFlight: false,
        });
        expect(expired.attempts[0].status).toBe("unknown");
        const [{ result: next }] =
          await tx`select railplan_private.claim_notification(${queued.id}::uuid,true,true) as result`;
        expect(next.claimId).toBeTruthy();
        await tx`select railplan_private.finish_notification(${claim.claimId}::uuid,'91',null,false,null)`;
        await tx`select railplan_private.finish_notification(${next.claimId}::uuid,null,'rejected',false,null)`;
        const send = vi.fn(async () => ({
          ok: true as const,
          messageId: "92",
        }));
        const result = await retryNotification(
          p,
          queued.id,
          { acknowledgeDuplicateRisk: true },
          { connection: tx, send },
        );
        expect(result).toMatchObject({
          status: "sent",
          telegramMessageId: "91",
          attemptCount: 2,
        });
        expect(send).not.toHaveBeenCalled();
      }));
    it("blocks superseded pending delivery without rolling back its published plan", () =>
      fixture(async (tx, p, c, _other, org) => {
        await approved(tx, p, c);
        const first = await createPlan(p, planInput, tx);
        await publishPlan(p, first.id, tx);
        const [pending] = await listPlanNotifications(p, first.id, tx);
        await configureNotification(
          p,
          org,
          { expectedVersion: 0, chatId: "123" },
          tx,
        );
        const second = await createPlan(p, planInput, tx);
        await publishPlan(p, second.id, tx);
        const send = vi.fn(async () => ({
          ok: true as const,
          messageId: "101",
        }));
        await expect(
          dispatchNotification(p, pending.id, {
            connection: tx,
            send,
            retry: true,
          }),
        ).rejects.toMatchObject({ code: "superseded_plan" });
        expect(send).not.toHaveBeenCalled();
        expect((await getNotification(p, pending.id, tx)).errorCode).toBe(
          "superseded_plan",
        );
      }));
  },
);
