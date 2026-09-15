import { z } from "zod";
import type { TransactionSql } from "postgres";
import type { VerifiedIdentity } from "@/lib/auth/session";
import type { Sql } from "@/lib/db/client";
import { PlanError } from "./input";
import { planIdSchema, planningNightSchema } from "./schemas";
import { transaction } from "./service";
import type { PlannerOverview, PlanSummary } from "./workspace-types";

const cursorSchema = z
  .object({
    planningNight: planningNightSchema,
    id: planIdSchema,
    createdAt: z
      .string()
      .max(50)
      .refine(
        (v) =>
          /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d/.test(v) &&
          Number.isFinite(Date.parse(v)),
      ),
  })
  .strict();
const querySchema = z
  .object({
    planningNight: planningNightSchema.optional(),
    cursor: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();
export function parseOverviewQuery(url: string) {
  const search = new URL(url).searchParams;
  if (
    search.toString().length > 1024 ||
    [...search.keys()].some((key) => search.getAll(key).length !== 1)
  )
    throw new PlanError("invalid_request", "Invalid overview query.");
  return querySchema.parse(Object.fromEntries(search));
}
type SummaryRow = PlanSummary & { cursorTime: string };
async function summaries(
  tx: TransactionSql,
  night: string,
  cursor: z.infer<typeof cursorSchema> | null,
  publicationOnly = false,
) {
  return tx<
    SummaryRow[]
  >`select r.id,r.planning_night::text as "planningNight",r.source_revision::text as "sourceRevision",r.input_digest as "inputDigest",
    r.parameters->>'strategy' as strategy,r.result->>'solverVersion' as "solverVersion",r.result->>'constraintVersion' as "constraintVersion",r.result->>'status' as status,
    r.created_at::text as "createdAt",r.created_at::text as "cursorTime",p.created_at::text as "publishedAt",later.plan_id as "supersededBy",
    case when later.plan_id is not null then 'superseded' when p.plan_id is not null then 'published' else 'draft' end as "publishState"
    from railplan_private.planning_runs r
    left join railplan_private.plan_publications p on p.plan_id=r.id
    left join railplan_private.plan_publications later on later.supersedes=r.id
    where r.planning_night=${night}::date
    ${publicationOnly ? tx`and p.plan_id is not null and later.plan_id is null` : tx``}
    ${cursor ? tx`and (r.created_at,r.id)<(${cursor.createdAt}::timestamptz,${cursor.id}::uuid)` : tx``}
    order by r.created_at desc,r.id desc limit ${publicationOnly ? 1 : 21}`;
}
function summary(row: SummaryRow): PlanSummary {
  const { cursorTime: _cursorTime, ...item } = row;
  void _cursorTime;
  return {
    ...item,
    createdAt: new Date(item.createdAt).toISOString(),
    publishedAt: item.publishedAt
      ? new Date(item.publishedAt).toISOString()
      : null,
  };
}
export async function getPlannerOverview(
  identity: VerifiedIdentity,
  raw: { planningNight?: string; cursor?: string },
  connection?: Sql | TransactionSql,
): Promise<PlannerOverview> {
  const input = querySchema.parse(raw);
  let cursor: z.infer<typeof cursorSchema> | null = null;
  if (input.cursor) {
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
      );
    } catch {
      throw new PlanError("invalid_request", "Invalid version cursor.");
    }
  }
  return transaction(
    identity,
    async (tx) => {
      const nights = await tx<
        PlannerOverview["nights"]
      >`select planning_night::text as "planningNight",window_start_minute as "startMinute",window_end_minute as "endMinute" from public.planning_nights order by planning_night desc`;
      const [{ revision }] = await tx<
        { revision: string }[]
      >`select railplan_private.read_current_planning_source()::text as revision`;
      const planningNight =
        input.planningNight ??
        cursor?.planningNight ??
        nights[0]?.planningNight ??
        null;
      if (
        planningNight &&
        !nights.some((n) => n.planningNight === planningNight)
      )
        throw new PlanError("not_found", "This planning night does not exist.");
      if (cursor && cursor.planningNight !== planningNight)
        throw new PlanError(
          "invalid_request",
          "The version cursor belongs to another night.",
        );
      if (!planningNight)
        return {
          nights,
          planningNight,
          sourceRevision: revision,
          pendingCount: 0,
          currentPublication: null,
          versions: [],
          nextCursor: null,
        };
      const [{ count }] = await tx<
        { count: number }[]
      >`select count(*)::integer as count from railplan_private.request_submissions s join railplan_private.request_revisions r on r.submission_id=s.id and r.version=s.current_version where r.status='submitted' and r.fields->>'planningNight'=${planningNight}`;
      const rows = await summaries(tx, planningNight, cursor);
      const current = await summaries(tx, planningNight, null, true);
      const last = rows[19];
      return {
        nights,
        planningNight,
        sourceRevision: revision,
        pendingCount: count,
        currentPublication: current[0] ? summary(current[0]) : null,
        versions: rows.slice(0, 20).map(summary),
        nextCursor:
          rows.length > 20
            ? Buffer.from(
                JSON.stringify({
                  planningNight,
                  id: last.id,
                  createdAt: last.cursorTime,
                }),
              ).toString("base64url")
            : null,
      };
    },
    connection,
  );
}
