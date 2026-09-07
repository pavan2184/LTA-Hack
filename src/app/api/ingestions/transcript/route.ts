import { assertSameOrigin } from "@/lib/plans/http";
import { ingestionResponse } from "@/lib/ingestions/http";
import { readTranscript } from "@/lib/ingestions/input";
import { extractAndSaveDrafts } from "@/lib/ingestions/service";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  return ingestionResponse(async (identity) => {
    assertSameOrigin(request);
    const transcript = await readTranscript(request);
    return { drafts: await extractAndSaveDrafts(identity, transcript) };
  }, 201);
}
