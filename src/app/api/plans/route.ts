import { readBoundedJson } from "@/lib/http/body";
import { createPlanSchema, planningNightSchema } from "@/lib/plans/schemas";
import { createPlan, listPlans } from "@/lib/plans/service";
import { assertPlanMutation, planResponse } from "@/lib/plans/http";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  return planResponse(
    "solve",
    async (identity) => {
      assertPlanMutation(request);
      return {
        plan: await createPlan(
          identity,
          createPlanSchema.parse(await readBoundedJson(request)),
        ),
      };
    },
    201,
  );
}
export async function GET(request: Request) {
  return planResponse("solve", async (identity) => ({
    plans: await listPlans(
      identity,
      planningNightSchema.parse(
        new URL(request.url).searchParams.get("planningNight"),
      ),
    ),
  }));
}
