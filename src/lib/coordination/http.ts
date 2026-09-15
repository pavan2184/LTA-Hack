import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireActor, type VerifiedIdentity } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/permissions";
import { BodyError } from "@/lib/http/body";
import { newRequestId } from "@/lib/http/errors";
import { requestLogger } from "@/lib/http/logger";
import { PlanError } from "@/lib/plans/input";
import { CoordinationError } from "./service";

export async function coordinationResponse(work: (identity: VerifiedIdentity) => Promise<unknown>, status = 200) {
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
    if (error instanceof AuthError) return fail(error.code, "You cannot perform this action.", error.code === "forbidden" ? 403 : 401);
    if (error instanceof CoordinationError || error instanceof PlanError) return fail(error.code, error.message, error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : ["conflict", "stale_plan", "invalid_plan"].includes(error.code) ? 409 : 400);
    if (error instanceof ZodError) return fail("invalid_request", "Correct the invalid or unsupported coordination fields.", 400);
    if (error instanceof BodyError) return fail(error.code, "The request body could not be read.", error.code === "payload_too_large" ? 413 : 400);
    if (error && typeof error === "object" && "code" in error && ["40001", "40P01"].includes(String(error.code))) return fail("conflict", "This case changed. Reload before trying again.", 409);
    requestLogger(requestId, "coordination").error("coordination operation failed");
    return fail("engine_error", "The coordination operation could not be completed.", 500);
  }
}
