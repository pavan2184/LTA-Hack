import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireActor, type VerifiedIdentity } from "@/lib/auth/session";
import { AuthError, type PlannerAction } from "@/lib/auth/permissions";
import { BodyError } from "@/lib/http/body";
import { apiError, newRequestId } from "@/lib/http/errors";
import { requestLogger } from "@/lib/http/logger";
import { PlanError } from "./input";
/** Browser mutations are same-origin JSON. Non-browser callers may omit Origin. */
export function assertPlanMutation(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    let sameOrigin = false;
    try {
      const supplied = new URL(origin);
      const internal = new URL(request.url);
      const host = request.headers.get("host");
      // Next may construct request.url using its configured listen hostname.
      // The browser's Host identifies the actual destination. Do not accept a
      // caller-supplied x-forwarded-host; reverse proxies must preserve Host.
      if (host !== null && /[\s/\\?#@,]/.test(host))
        throw new Error("Invalid host");
      const destination =
        host === null ? internal : new URL(`${internal.protocol}//${host}`);
      sameOrigin =
        ["http:", "https:"].includes(supplied.protocol) &&
        supplied.origin === origin &&
        supplied.origin === destination.origin;
    } catch {
      /* Opaque/malformed Origin or Host fails closed. */
    }
    if (!sameOrigin) throw new AuthError("forbidden");
  }
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new PlanError(
      "invalid_request",
      "Use application/json for planning requests.",
    );
}
export type PlanRouteContext = { params: Promise<{ id: string }> };
export async function planResponse(
  action: PlannerAction,
  work: (identity: VerifiedIdentity) => Promise<unknown>,
  status = 200,
) {
  const requestId = newRequestId();
  let identity: VerifiedIdentity;
  try {
    identity = (await requireActor(action)).identity;
  } catch (error) {
    const code = error instanceof AuthError ? error.code : "auth_unavailable";
    return apiError(
      code,
      code === "unauthenticated"
        ? "Sign in to continue."
        : code === "forbidden"
          ? "Planner access is required."
          : "Authentication is unavailable.",
      requestId,
    );
  }
  try {
    return NextResponse.json(await work(identity), {
      status,
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthError)
      return apiError(
        error.code,
        "Planner authentication is required.",
        requestId,
      );
    if (error instanceof PlanError)
      return apiError(error.code, error.message, requestId);
    if (error instanceof BodyError)
      return apiError(
        error.code,
        error.code === "payload_too_large"
          ? "The request is too large."
          : "The request body was not valid JSON.",
        requestId,
      );
    if (error instanceof ZodError)
      return apiError(
        "invalid_request",
        "The planning request has invalid or unsupported fields.",
        requestId,
      );
    // Never serialize database exceptions, parameters, decision text or tokens.
    requestLogger(requestId, "plans").error("plan operation failed");
    return apiError(
      "engine_error",
      "The plan operation could not be completed.",
      requestId,
    );
  }
}
