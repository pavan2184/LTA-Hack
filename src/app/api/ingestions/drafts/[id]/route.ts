import { z } from "zod";
import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation, type PlanRouteContext } from "@/lib/plans/http";
import { requestResponse } from "@/lib/requests/http";
import { getPrivateDraft, updatePrivateDraft } from "@/lib/ingestions/service";
import { editPrivateDraftSchema } from "@/lib/ingestions/review-schemas";
export const runtime = "nodejs";
export async function GET(_request: Request, context: PlanRouteContext) {
  return requestResponse(async (identity) => ({
    draft: await getPrivateDraft(
      identity,
      z.uuid().parse((await context.params).id),
    ),
  }));
}
export async function PATCH(request: Request, context: PlanRouteContext) {
  return requestResponse(async (identity) => {
    assertPlanMutation(request);
    return {
      draft: await updatePrivateDraft(
        identity,
        z.uuid().parse((await context.params).id),
        editPrivateDraftSchema.parse(await readBoundedJson(request)),
      ),
    };
  });
}
