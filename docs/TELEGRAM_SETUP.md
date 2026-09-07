# Telegram notification setup

RailPlan sends only fabricated prototype schedules. A planner must verify that a
chat belongs to the intended contractor organisation before saving its destination.
Do not configure a real operational group for prototype testing.

## Server configuration

Create or select a bot under your control using Telegram's
[official BotFather instructions](https://core.telegram.org/bots/tutorial#obtain-your-bot-token).
Put its token in the existing Git-ignored `.env.local` on the RailPlan server as
`TELEGRAM_BOT_TOKEN`, as documented in `.env.example`, then restart the Node server.
Never put it in a `NEXT_PUBLIC_` variable, URL, screenshot, commit or browser field.
RailPlan uses a fixed HTTPS `sendMessage` endpoint with no redirects or provider
retries. Do not paste a token into a browser URL to troubleshoot it.

## Planner workflow

Open Saved plans and the Telegram destination settings. Enter the organisation's
numeric chat ID, including its minus sign for a group where applicable. Add the
bot to that intended group with permission to send, or start a direct chat with
it. Saving a destination does not send anything. The separate **Send test message**
action sends the displayed prototype test to the saved destination and records its
result. Verify receipt in the intended chat before publishing a schedule.

Publishing a valid, current saved plan records it and creates one delivery for
each contractor whose saved request information or schedule changed compared with
the previous publication for that night. The fabricated baseline requests have no
contractor organisation and therefore receive no notification. Messages include
only the recipient organisation's changed work and the prototype disclaimer.

## Reading delivery results

- **Pending:** no attempt has started. A bounded initial dispatch may leave pending
  work in a large batch; use the explicit retry action.
- **Sent:** Telegram returned a matching destination and message ID that was saved.
  RailPlan will never retry a delivery already recorded as sent.
- **Failed:** inspect the sanitized reason, fix configuration where appropriate,
  wait until any retry time, then retry explicitly.
- **Uncertain outcome:** a timeout, network/server failure, or abandoned attempt
  cannot prove the message was not received. Check the destination first. Retrying
  requires acknowledging that a duplicate could be sent.

Changing a destination affects future claims, including explicit retries; earlier
attempts retain their original chat ID. An unsent delivery for a superseded plan
cannot be sent as though it were the current schedule. No background loop retries
failures. Telegram has no sendMessage client idempotency key, so a crash between
receipt and recording success cannot guarantee exactly-once external delivery.
Oversized messages are visibly rejected without silently omitting requests.

## Verification boundary

Automated tests use controlled Telegram responses and never contact a real chat.
Actual bot access, recipient ownership and real Telegram receipt require a separately
authorized test with configured credentials. Those live checks have not been run.
