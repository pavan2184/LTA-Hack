import { NextResponse } from "next/server";
import { requireActor, type VerifiedIdentity } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/permissions";
import { newRequestId } from "@/lib/http/errors";
import { requestLogger } from "@/lib/http/logger";
import {
  IngestionError,
  ingestionMessages,
  type IngestionErrorCode,
} from "./errors";
const statusFor: Record<IngestionErrorCode, number> = {
  payload_too_large: 413,
  invalid_encoding: 400,
  empty_transcript: 400,
  invalid_request: 400,
  model_refused: 422,
  model_timeout: 504,
  model_unavailable: 503,
  invalid_model_output: 502,
  invalid_evidence: 422,
  no_proposals: 422,
  rate_limited: 429,
};
export async function ingestionResponse(
  work: (identity: VerifiedIdentity) => Promise<unknown>,
  status = 200,
) {
  const requestId = newRequestId();
  const headers = { "x-request-id": requestId, "cache-control": "no-store" };
  const fail = (
    code: string,
    message: string,
    http: number,
    extra: Record<string, string> = {},
  ) =>
    NextResponse.json(
      { error: { code, message, requestId } },
      { status: http, headers: { ...headers, ...extra } },
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
    if (error instanceof AuthError)
      return fail(
        error.code,
        "This action is not authorized.",
        error.code === "forbidden"
          ? 403
          : error.code === "unauthenticated"
            ? 401
            : 503,
      );
    if (error instanceof IngestionError)
      return fail(
        error.code,
        ingestionMessages[error.code],
        statusFor[error.code],
        error.retryAfterSeconds
          ? { "retry-after": String(error.retryAfterSeconds) }
          : {},
      );
    // Neither provider exceptions nor SQL exceptions are logged: each may carry
    // source, excerpt, payload or credential text. Correlate by request ID only.
    requestLogger(requestId, "ingestions").error(
      "ingestion storage operation failed",
    );
    return fail(
      "storage_unavailable",
      "Draft storage is unavailable. No extraction result can be confirmed; reload your private drafts before retrying.",
      503,
    );
  }
}
