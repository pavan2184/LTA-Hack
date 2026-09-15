import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation } from "@/lib/plans/http";
import { coordinationResponse } from "@/lib/coordination/http";
import { createCaseSchema, caseFiltersSchema } from "@/lib/coordination/schemas";
import { createCase, listCases } from "@/lib/coordination/service";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: Request) {
  return coordinationResponse(identity => listCases(identity, caseFiltersSchema.parse(Object.fromEntries(new URL(request.url).searchParams))));
}
export async function POST(request: Request) {
  return coordinationResponse(async identity => {
    assertPlanMutation(request);
    return { case: await createCase(identity, createCaseSchema.parse(await readBoundedJson(request))) };
  }, 201);
}
