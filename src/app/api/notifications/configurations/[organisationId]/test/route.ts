import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation } from "@/lib/plans/http";
import {
  notificationResponse,
  type OrganisationContext,
} from "@/lib/notifications/http";
import {
  testConfigurationSchema,
  notificationIdSchema,
} from "@/lib/notifications/schemas";
import { testNotificationConfiguration } from "@/lib/notifications/service";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request, context: OrganisationContext) {
  return notificationResponse(async (identity) => {
    assertPlanMutation(request);
    const id = notificationIdSchema.parse(
      (await context.params).organisationId,
    );
    return {
      delivery: await testNotificationConfiguration(
        identity,
        id,
        testConfigurationSchema.parse(await readBoundedJson(request)),
      ),
    };
  });
}
