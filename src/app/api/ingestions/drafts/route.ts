import { ingestionResponse } from "@/lib/ingestions/http";
import { listPrivateDrafts } from "@/lib/ingestions/service";
export const runtime = "nodejs";
export async function GET() {
  return ingestionResponse(async (identity) => ({
    drafts: await listPrivateDrafts(identity),
  }));
}
