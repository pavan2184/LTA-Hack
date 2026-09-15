import { planIdSchema } from "@/lib/plans/schemas";
import { coordinationResponse } from "@/lib/coordination/http";
import { getCase } from "@/lib/coordination/service";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return coordinationResponse(async identity => ({ case: await getCase(identity, planIdSchema.parse((await context.params).id)) }));
}
