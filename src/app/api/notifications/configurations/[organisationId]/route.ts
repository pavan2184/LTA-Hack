import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation } from "@/lib/plans/http";
import {
  notificationResponse,
  type OrganisationContext,
} from "@/lib/notifications/http";
import {
  configurationSchema,
  notificationIdSchema,
} from "@/lib/notifications/schemas";
import { configureNotification } from "@/lib/notifications/service";
export const runtime = "nodejs";
export async function PUT(request: Request, context: OrganisationContext) {
  return notificationResponse(async (identity) => {
    assertPlanMutation(request);
    const id = notificationIdSchema.parse(
      (await context.params).organisationId,
    );
    return {
      configuration: await configureNotification(
        identity,
        id,
        configurationSchema.parse(await readBoundedJson(request)),
      ),
    };
  });
}
