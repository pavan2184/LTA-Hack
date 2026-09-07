import { withAuthenticatedTransaction, type VerifiedIdentity } from "./session";
import { requireAction } from "./permissions";
export async function consumeAssistantToken(identity: VerifiedIdentity) {
  return withAuthenticatedTransaction(identity, async (tx, actor) => {
    requireAction(actor, "assistant");
    const [limit] = await tx<{ allowed: boolean; retry_after_seconds: number; remaining: number }[]>`
      select * from railplan_private.consume_assistant_token()`;
    return { allowed: limit.allowed, retryAfterSeconds: limit.retry_after_seconds, remaining: limit.remaining };
  });
}
