import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation } from "@/lib/plans/http";
import { deferredWorkResponse, parseWorkItemQuery } from "@/lib/deferred-work/http";
import { recordDeferralSchema } from "@/lib/deferred-work/schemas";
import { recordDeferral, listWorkItems } from "@/lib/deferred-work/service";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: Request) {
  return deferredWorkResponse(identity => listWorkItems(identity, parseWorkItemQuery(request)));
}
export async function POST(request: Request) {
  return deferredWorkResponse(async identity => {
    assertPlanMutation(request);
    return { workItem: await recordDeferral(identity, recordDeferralSchema.parse(await readBoundedJson(request))) };
  }, 201);
}
