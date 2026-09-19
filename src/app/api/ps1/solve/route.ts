import { BodyError, readBoundedJson } from "@/lib/http/body";
import { assertSameOrigin } from "@/lib/plans/http";
import { parseSolveRequest, PS1_MAX_BODY_BYTES } from "@/lib/ps1/request";
import { NativeSolverUnavailableError, solveNative } from "@/lib/ps1/server-solver";
import { NativeModelSizeError } from "@/lib/ps1/cp-sat-model";

export const runtime = "nodejs";
export const maxDuration = 90;

// One Next process per VM. A solve defaults to 16 workers; queuing arbitrary
// uploads in memory would compete with the solver and inflate response times.
let busy = false;
const headers = { "cache-control": "no-store" };
function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers });
}

export async function POST(request: Request) {
  try { assertSameOrigin(request); }
  catch { return error(403, "forbidden", "Use the scheduler from this site's upload page."); }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return error(415, "invalid_request", "Use application/json for a solve request.");
  }
  if (busy) return Response.json({ error: { code: "solver_busy", message: "The solver is processing another schedule. Retry shortly." } },
    { status: 429, headers: { ...headers, "retry-after": "5" } });
  busy = true;
  try {
    let input;
    try { input = parseSolveRequest(await readBoundedJson(request, PS1_MAX_BODY_BYTES, 10_000)); }
    catch (cause) {
      if (cause instanceof BodyError) return error(cause.code === "payload_too_large" ? 413 : 400, cause.code, "The solve request must be valid JSON and at most 4 MB.");
      return error(400, "invalid_instance", "Check the instance, pins and capacity cuts. The server accepts up to 2,000 activities, 260 weeks and 60,000 activity-weeks.");
    }
    const outcome = await solveNative(input.instance, { scenario: input.scenario, pins: input.pins, disruptions: input.disruptions, signal: request.signal });
    return Response.json({ outcome }, { headers });
  } catch (cause) {
    if (cause instanceof NativeModelSizeError) return error(413, "model_too_large", "This instance's co-sharing model exceeds the server's construction limit. No activities were removed; use a larger offline solver configuration.");
    if (cause instanceof NativeSolverUnavailableError) return error(503, "solver_unavailable", "Native CP-SAT is unavailable. The host needs Python with the pinned OR-Tools dependency installed.");
    if (request.signal.aborted || (cause instanceof Error && cause.name === "AbortError")) return error(499, "cancelled", "The solve was cancelled.");
    return error(502, "solver_failed", "The native solver could not return a validated schedule. Retry or check the server setup.");
  } finally { busy = false; }
}
