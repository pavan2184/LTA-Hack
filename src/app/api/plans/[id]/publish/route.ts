import { readBoundedJson } from "@/lib/http/body";
import { planIdSchema, publishPlanSchema } from "@/lib/plans/schemas";
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
    return { plan: await publishPlan(identity, id) };
  });
}
