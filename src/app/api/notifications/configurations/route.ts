import { notificationResponse } from "@/lib/notifications/http";
import { listNotificationConfigurations } from "@/lib/notifications/service";
import { isTelegramConfigured } from "@/lib/notifications/telegram";
export const runtime = "nodejs";
export async function GET() {
  return notificationResponse(async (identity) => ({
    configurations: await listNotificationConfigurations(identity),
    botConfigured: isTelegramConfigured(),
  }));
}
