import { readBoundedJson } from "@/lib/http/body";
import { planIdSchema, publishPlanSchema } from "@/lib/plans/schemas";
import { dispatchPlanNotifications } from "@/lib/notifications/service";
import { publishPlan } from "@/lib/plans/service";
import {
  assertPlanMutation,
  planResponse,
  type PlanRouteContext,
} from "@/lib/plans/http";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request, context: PlanRouteContext) {
  return planResponse("publish", async (identity) => {
    assertPlanMutation(request);
    const id = planIdSchema.parse((await context.params).id);
    publishPlanSchema.parse(await readBoundedJson(request));
    const plan = await publishPlan(identity, id);
    // Publication is committed before this separate external-delivery phase.
    // Notification storage/provider failures must not misreport publication.
    let notificationsWarning: string | null = null;
    try {
      await dispatchPlanNotifications(identity, id);
    } catch {
      notificationsWarning =
        "The plan is published, but notification processing could not be completed. Reload delivery status before explicitly retrying.";
    }
    return { plan, notificationsWarning };
  });
}
