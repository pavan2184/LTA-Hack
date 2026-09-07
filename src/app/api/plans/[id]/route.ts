import { planIdSchema } from "@/lib/plans/schemas";
import { getPlan } from "@/lib/plans/service";
import { planResponse, type PlanRouteContext } from "@/lib/plans/http";
export const runtime = "nodejs";
export async function GET(_request: Request, context: PlanRouteContext) {
  return planResponse("solve", async (identity) => ({
    plan: await getPlan(
      identity,
      planIdSchema.parse((await context.params).id),
    ),
  }));
}
