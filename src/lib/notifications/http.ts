import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireActor, type VerifiedIdentity } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/permissions";
import { BodyError } from "@/lib/http/body";
import { newRequestId } from "@/lib/http/errors";
import { requestLogger } from "@/lib/http/logger";
import { PlanError } from "@/lib/plans/input";
import { NotificationError } from "./service";
export type OrganisationContext = {
  params: Promise<{ organisationId: string }>;
};
export type NotificationContext = { params: Promise<{ id: string }> };
export async function notificationResponse(
  work: (identity: VerifiedIdentity) => Promise<unknown>,
) {
  const requestId = newRequestId(),
    headers = { "x-request-id": requestId, "cache-control": "no-store" };
  const fail = (code: string, message: string, status: number) =>
    NextResponse.json(
      { error: { code, message, requestId } },
      { status, headers },
    );
  let identity: VerifiedIdentity;
  try {
    identity = (await requireActor("publish")).identity;
  } catch (error) {
    const code = error instanceof AuthError ? error.code : "auth_unavailable";
    return fail(
      code,
      code === "unauthenticated"
        ? "Sign in to continue."
        : code === "forbidden"
          ? "Planner access is required."
          : "Authentication is unavailable.",
      code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : 503,
    );
  }
  try {
    return NextResponse.json(await work(identity), { headers });
  } catch (error) {
    if (error instanceof AuthError)
      return fail(
        error.code,
        "Planner access is required.",
        error.code === "forbidden"
          ? 403
          : error.code === "unauthenticated"
            ? 401
            : 503,
      );
    if (error instanceof NotificationError)
      return fail(
        error.code,
        error.message,
        error.code === "not_found"
          ? 404
          : error.code === "invalid_request"
            ? 400
            : error.code === "storage_unavailable"
              ? 503
              : 409,
      );
    if (error instanceof ZodError)
      return fail(
        "invalid_request",
        "The notification request has invalid or unsupported fields.",
        400,
      );
    if (error instanceof BodyError)
      return fail(
        error.code,
        "The notification body could not be read.",
        error.code === "payload_too_large" ? 413 : 400,
      );
    if (error instanceof PlanError) return fail(error.code, error.message, 400);
    requestLogger(requestId, "notifications").error(
      "notification operation failed",
    );
    return fail(
      "storage_unavailable",
      "Notification storage is unavailable. Reload delivery status before retrying.",
      503,
    );
  }
}
