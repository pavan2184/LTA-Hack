import { planIdSchema } from "@/lib/plans/schemas";
import { deferredWorkResponse } from "@/lib/deferred-work/http";
import { getWorkItem } from "@/lib/deferred-work/service";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return deferredWorkResponse(async identity => ({ workItem: await getWorkItem(identity, planIdSchema.parse((await context.params).id)) }));
}
