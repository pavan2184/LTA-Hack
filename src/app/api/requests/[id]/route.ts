import { z } from "zod";
import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation, type PlanRouteContext } from "@/lib/plans/http";
import { requestResponse } from "@/lib/requests/http";
import { updateRequestSchema } from "@/lib/requests/schemas";
import { getRequest, updateRequest } from "@/lib/requests/service";
export const runtime = "nodejs";
export async function GET(_request: Request, context: PlanRouteContext) {
  return requestResponse(async (identity) => ({
    request: await getRequest(
      identity,
      z.uuid().parse((await context.params).id),
    ),
  }));
}
export async function PATCH(request: Request, context: PlanRouteContext) {
  return requestResponse(async (identity) => {
    assertPlanMutation(request);
    return {
      request: await updateRequest(
        identity,
        z.uuid().parse((await context.params).id),
        updateRequestSchema.parse(await readBoundedJson(request)),
      ),
    };
  });
}
