import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation } from "@/lib/plans/http";
import { requestResponse } from "@/lib/requests/http";
import { createRequestSchema } from "@/lib/requests/schemas";
import { createRequest, listRequests } from "@/lib/requests/service";
import { planningNightSchema } from "@/lib/plans/schemas";
export const runtime = "nodejs";
export async function GET(request?: Request) {
  return requestResponse(async (identity) => {
    const raw = request ? new URL(request.url).searchParams.get("planningNight") : null;
    const night = raw === null ? undefined : planningNightSchema.parse(raw);
    return { requests: await listRequests(identity, undefined, night) };
  });
}
export async function POST(request: Request) {
  return requestResponse(async (identity) => {
    assertPlanMutation(request);
    return {
      request: await createRequest(
        identity,
        createRequestSchema.parse(await readBoundedJson(request)),
      ),
    };
  }, 201);
}
