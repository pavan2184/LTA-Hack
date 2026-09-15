import { readBoundedJson } from "@/lib/http/body";
import {
  planResponse,
  assertPlanMutation,
  type PlanRouteContext,
} from "@/lib/plans/http";
import { analysisSchema, planIdSchema } from "@/lib/plans/schemas";
import { analysePlan } from "@/lib/plans/analysis";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request, context: PlanRouteContext) {
  return planResponse("solve", async (identity) => {
    assertPlanMutation(request);
    const id = planIdSchema.parse((await context.params).id).toLowerCase();
    return analysePlan(
      identity,
      id,
      analysisSchema.parse(await readBoundedJson(request)),
    );
  });
}
