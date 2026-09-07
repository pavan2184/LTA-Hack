/** Browser-safe delivery records. Provider credentials never cross this contract. */
export interface NotificationAttempt {
  id: string;
  number: number;
  actorId: string;
  chatId: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: "sending" | "sent" | "failed" | "unknown";
  telegramMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  ambiguous: boolean;
}
export interface NotificationDelivery {
  id: string;
  organisationId: string;
  organisationName: string;
  planId: string | null;
  planningNight: string | null;
  kind: "publication" | "test";
  messageText: string;
  deduplicationKey: string;
  status: "pending" | "sent" | "failed";
  ambiguous: boolean;
  inFlight: boolean;
  attemptCount: number;
  telegramMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
  sentAt: string | null;
  attempts: NotificationAttempt[];
}
export interface NotificationConfiguration {
  organisationId: string;
  organisationName: string;
  chatId: string | null;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  lastTest: NotificationDelivery | null;
}
