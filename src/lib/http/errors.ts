import { NextResponse } from "next/server";

/**
 * The error envelope every route returns.
 *
 * Shared with the client rather than redeclared there, so a route that starts
 * returning a new code cannot drift from the type the browser narrows on.
 */
export interface ApiError {
  error: {
    code: ApiErrorCode;
    /** Safe to show a planner. Never carries an internal message verbatim. */
    message: string;
    /** Correlates the response with the server log line that recorded it. */
    requestId: string;
  };
}

export type ApiErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "auth_unavailable"
  | "malformed_request"
  | "invalid_request"
  | "payload_too_large"
  | "rate_limited"
  | "engine_error"
  | "not_found"
  | "stale_plan"
  | "invalid_plan";

const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  auth_unavailable: 503,
  malformed_request: 400,
  invalid_request: 400,
  payload_too_large: 413,
  rate_limited: 429,
  engine_error: 500,
  not_found: 404,
  stale_plan: 409,
  invalid_plan: 409,
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  headers?: Record<string, string>,
): NextResponse<ApiError> {
  return NextResponse.json<ApiError>(
    { error: { code, message, requestId } },
    { status: STATUS[code], headers },
  );
}

/**
 * Correlation id for one request.
 *
 * `crypto.randomUUID` is available in the Node runtime this route pins. The
 * id is echoed to the client so a planner reporting "the assistant failed"
 * hands over something that finds the log line.
 */
export function newRequestId(): string {
  return crypto.randomUUID();
}
