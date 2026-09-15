import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation } from "@/lib/plans/http";
import { planIdSchema } from "@/lib/plans/schemas";
import { coordinationResponse } from "@/lib/coordination/http";
import { caseActionSchema } from "@/lib/coordination/schemas";
import { actOnCase } from "@/lib/coordination/service";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return coordinationResponse(async identity => {
    assertPlanMutation(request);
    return actOnCase(identity, planIdSchema.parse((await context.params).id), caseActionSchema.parse(await readBoundedJson(request)));
  });
}
