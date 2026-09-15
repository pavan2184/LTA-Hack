import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation } from "@/lib/plans/http";
import { planIdSchema } from "@/lib/plans/schemas";
import { deferredWorkResponse } from "@/lib/deferred-work/http";
import { workItemActionSchema } from "@/lib/deferred-work/schemas";
import { actOnWorkItem } from "@/lib/deferred-work/service";
import { prepareCarryForward, prepareCarryForwardSchema } from "@/lib/deferred-work/carry-forward";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return deferredWorkResponse(async identity => {
    assertPlanMutation(request);
    const id = planIdSchema.parse((await context.params).id);
    const input = z.union([workItemActionSchema, prepareCarryForwardSchema.extend({ action: z.literal("prepare-carry-forward") })]).parse(await readBoundedJson(request));
    if (input.action === "prepare-carry-forward") {
      const { action, ...command } = input;
      void action;
      return prepareCarryForward(identity, id, command);
    }
    return { workItem: await actOnWorkItem(identity, id, input) };
  });
}
