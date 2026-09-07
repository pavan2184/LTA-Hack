import { z } from "zod";
import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation, type PlanRouteContext } from "@/lib/plans/http";
import { requestResponse } from "@/lib/requests/http";
import { submitPrivateDraft } from "@/lib/ingestions/service";
import { submitPrivateDraftSchema } from "@/lib/ingestions/review-schemas";
export const runtime = "nodejs";
export async function POST(request: Request, context: PlanRouteContext) {
  return requestResponse(async (identity) => {
    assertPlanMutation(request);
    return submitPrivateDraft(
      identity,
      z.uuid().parse((await context.params).id),
      submitPrivateDraftSchema.parse(await readBoundedJson(request)),
    );
  });
}
