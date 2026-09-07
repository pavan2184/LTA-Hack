import { requestResponse } from "@/lib/requests/http";
import { getRequestCatalogue } from "@/lib/requests/service";
export const runtime = "nodejs";
export async function GET() {
  return requestResponse(async (identity) => ({
    catalogue: await getRequestCatalogue(identity),
  }));
}
