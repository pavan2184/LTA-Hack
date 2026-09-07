import { ZodError } from "zod";
import { requireActor } from "@/lib/auth/session";
import { AuthError } from "@/lib/auth/permissions";
import { apiError, newRequestId } from "@/lib/http/errors";
import { requestLogger } from "@/lib/http/logger";
import { PlanError } from "@/lib/plans/input";
import { planIdSchema } from "@/lib/plans/schemas";
import type { PlanRouteContext } from "@/lib/plans/http";
import { getPlanExport } from "@/lib/exports/service";
import {
  parseExportFormat,
  serializePlanExport,
} from "@/lib/exports/serialize";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: Request, context: PlanRouteContext) {
  const requestId = newRequestId(),
    headers = {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-request-id": requestId,
    };
  let identity;
  try {
    identity = (await requireActor("solve")).identity;
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
      headers,
    );
  }
  try {
    const id = planIdSchema.parse((await context.params).id).toLowerCase(),
      format = parseExportFormat(new URL(request.url));
    const document = await getPlanExport(identity, id);
    return new Response(serializePlanExport(document, format), {
      headers: {
        ...headers,
        "content-type":
          format === "json"
            ? "application/json; charset=utf-8"
            : "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="railplan-${id}.${format}"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError)
      return apiError(
        error.code,
        "Planner authentication is required.",
        requestId,
        headers,
      );
    if (error instanceof PlanError)
      return apiError(error.code, error.message, requestId, headers);
    if (error instanceof ZodError)
      return apiError(
        "invalid_request",
        "Specify a valid saved plan UUID and format=json or format=csv.",
        requestId,
        headers,
      );
    requestLogger(requestId, "exports").error("saved plan export failed");
    return apiError(
      "engine_error",
      "The saved plan could not be exported.",
      requestId,
      headers,
    );
  }
}
