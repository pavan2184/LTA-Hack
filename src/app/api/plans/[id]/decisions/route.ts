import { readBoundedJson } from "@/lib/http/body";
import { planIdSchema, decisionSchema } from "@/lib/plans/schemas";
import { recordDecision } from "@/lib/plans/service";
import {
  assertPlanMutation,
  planResponse,
  type PlanRouteContext,
} from "@/lib/plans/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: PlanRouteContext) {
  return planResponse(
    "approve",
    async (identity) => {
      assertPlanMutation(request);
      return {
        decision: await recordDecision(
          identity,
          planIdSchema.parse((await context.params).id),
          decisionSchema.parse(await readBoundedJson(request)),
        ),
      };
    },
    201,
  );
}
