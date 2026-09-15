import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation } from "@/lib/plans/http";
import { planIdSchema } from "@/lib/plans/schemas";
import { deferredWorkResponse } from "@/lib/deferred-work/http";
import { workItemActionSchema } from "@/lib/deferred-work/schemas";
import { actOnWorkItem } from "@/lib/deferred-work/service";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return deferredWorkResponse(async identity => {
    assertPlanMutation(request);
    const id = planIdSchema.parse((await context.params).id);
    return { workItem: await actOnWorkItem(identity, id, workItemActionSchema.parse(await readBoundedJson(request))) };
  });
}
