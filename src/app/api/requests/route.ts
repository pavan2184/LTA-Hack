import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation } from "@/lib/plans/http";
import { requestResponse } from "@/lib/requests/http";
import { createRequestSchema } from "@/lib/requests/schemas";
import { createRequest, listRequests } from "@/lib/requests/service";
export const runtime = "nodejs";
export async function GET() {
  return requestResponse(async (identity) => ({
    requests: await listRequests(identity),
  }));
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
