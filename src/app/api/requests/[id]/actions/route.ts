import { z } from "zod";
import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation, type PlanRouteContext } from "@/lib/plans/http";
import { requestResponse } from "@/lib/requests/http";
import { actionSchema } from "@/lib/requests/schemas";
import { actOnRequest } from "@/lib/requests/service";
export const runtime = "nodejs";
export async function POST(request: Request, context: PlanRouteContext) {
  return requestResponse(async (identity) => {
    assertPlanMutation(request);
    return {
      request: await actOnRequest(
        identity,
        z.uuid().parse((await context.params).id),
        actionSchema.parse(await readBoundedJson(request)),
      ),
    };
  });
}
