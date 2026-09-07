import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireActor, type VerifiedIdentity } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/permissions";
import { BodyError } from "@/lib/http/body";
import { newRequestId } from "@/lib/http/errors";
import { requestLogger } from "@/lib/http/logger";
import { PlanError } from "@/lib/plans/input";
import { RequestError } from "./service";
export async function requestResponse(
  work: (identity: VerifiedIdentity) => Promise<unknown>,
  status = 200,
) {
  const requestId = newRequestId();
  const headers = { "x-request-id": requestId, "cache-control": "no-store" };
  const fail = (
    code: string,
    message: string,
    status: number,
    fieldErrors: Record<string, string> = {},
  ) =>
    NextResponse.json(
      { error: { code, message, requestId, fieldErrors } },
      { status, headers },
    );
  let identity: VerifiedIdentity;
  try {
    identity = (await requireActor()).identity;
  } catch (error) {
    const code = error instanceof AuthError ? error.code : "auth_unavailable";
    return fail(
      code,
      code === "unauthenticated"
        ? "Sign in to continue."
        : code === "forbidden"
          ? "An assigned account is required."
          : "Authentication is unavailable.",
      code === "unauthenticated" ? 401 : code === "forbidden" ? 403 : 503,
    );
  }
  try {
    return NextResponse.json(await work(identity), { status, headers });
  } catch (error) {
    if (error instanceof RequestError)
      return fail(
        error.code,
        error.message,
        error.code === "not_found"
          ? 404
          : error.code === "forbidden"
            ? 403
            : ["conflict", "invalid_transition"].includes(error.code)
              ? 409
              : 400,
        error.fieldErrors,
      );
    if (error instanceof AuthError)
      return fail(
        error.code,
        "You cannot perform this action.",
        error.code === "forbidden" ? 403 : 401,
      );
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) {
        const path =
          issue.path.filter((p) => p !== "fields").join(".") || "fields";
        fields[path] = issue.message;
      }
      return fail(
        "invalid_request",
        "Correct the highlighted request fields.",
        400,
        fields,
      );
    }
    if (error instanceof BodyError)
      return fail(
        error.code,
        "The request body could not be read.",
        error.code === "payload_too_large" ? 413 : 400,
      );
    if (error instanceof PlanError) return fail(error.code, error.message, 400);
    requestLogger(requestId, "requests").error("request operation failed");
    return fail(
      "engine_error",
      "The request operation could not be completed.",
      500,
    );
  }
}
