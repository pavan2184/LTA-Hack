import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireActor, type VerifiedIdentity } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/permissions";
import { BodyError } from "@/lib/http/body";
import { newRequestId } from "@/lib/http/errors";
import { requestLogger } from "@/lib/http/logger";
import { DeferredWorkError } from "./service";
import { workItemFiltersSchema } from "./schemas";

export function parseWorkItemQuery(request: Request) {
  const url = new URL(request.url);
  if (url.search.length > 2048 || [...url.searchParams.keys()].some(k => url.searchParams.getAll(k).length !== 1)) throw new DeferredWorkError("invalid_request");
  return workItemFiltersSchema.parse(Object.fromEntries(url.searchParams));
}
export async function deferredWorkResponse(work: (identity: VerifiedIdentity) => Promise<unknown>, status = 200) {
  const requestId = newRequestId();
  const headers = { "x-request-id": requestId, "cache-control": "no-store" };
  const fail = (code: string, message: string, status: number) => NextResponse.json({ error: { code, message, requestId } }, { status, headers });
  let identity: VerifiedIdentity;
  try { identity = (await requireActor()).identity; }
  catch (error) {
    const code = error instanceof AuthError ? error.code : "auth_unavailable";
    return fail(code, code === "unauthenticated" ? "Sign in to continue." : code === "forbidden" ? "An assigned account is required." : "Authentication is unavailable.", code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : 503);
  }
  try { return NextResponse.json(await work(identity), { status, headers }); }
  catch (error) {
    if (error instanceof AuthError) return fail(error.code, "You cannot perform this action.", error.code === "forbidden" ? 403 : error.code === "auth_unavailable" ? 503 : 401);
    if (error instanceof DeferredWorkError) return fail(error.code, error.message, error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : error.code === "conflict" ? 409 : 400);
    if (error instanceof ZodError) return fail("invalid_request", "Correct the invalid or unsupported work-item fields.", 400);
    if (error instanceof BodyError) return fail(error.code, "The request body could not be read.", error.code === "payload_too_large" ? 413 : 400);
    if (error && typeof error === "object" && "code" in error && ["40001", "40P01"].includes(String(error.code))) return fail("conflict", "This work item changed. Reload before trying again.", 409);
    requestLogger(requestId, "deferred-work").error("deferred work operation failed");
    return fail("engine_error", "The work-item operation could not be completed.", 500);
  }
}
