import {
  notificationResponse,
  type NotificationContext,
} from "@/lib/notifications/http";
import { notificationIdSchema } from "@/lib/notifications/schemas";
import { listPlanNotifications } from "@/lib/notifications/service";
export const runtime = "nodejs";
export async function GET(_request: Request, context: NotificationContext) {
  return notificationResponse(async (identity) => ({
    deliveries: await listPlanNotifications(
      identity,
      notificationIdSchema.parse((await context.params).id),
    ),
  }));
}
