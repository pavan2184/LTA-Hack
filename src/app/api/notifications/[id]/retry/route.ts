import { readBoundedJson } from "@/lib/http/body";
import { assertPlanMutation } from "@/lib/plans/http";
import {
  notificationResponse,
  type NotificationContext,
} from "@/lib/notifications/http";
import { retrySchema, notificationIdSchema } from "@/lib/notifications/schemas";
import { retryNotification } from "@/lib/notifications/service";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request, context: NotificationContext) {
  return notificationResponse(async (identity) => {
    assertPlanMutation(request);
    const id = notificationIdSchema.parse((await context.params).id);
    return {
      delivery: await retryNotification(
        identity,
        id,
        retrySchema.parse(await readBoundedJson(request)),
      ),
    };
  });
}
