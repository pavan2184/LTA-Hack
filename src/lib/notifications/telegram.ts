/** Server-side Telegram transport. Only allow-listed outcomes escape this boundary:
 * Telegram errors may echo the token-bearing request URL or submitted contents.
 * https://core.telegram.org/bots/api#sendmessage (checked 2026-09-07).
 */
export type TelegramResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      code:
        | "missing_credentials"
        | "invalid_chat"
        | "invalid_message"
        | "rejected"
        | "rate_limited"
        | "unavailable"
        | "ambiguous";
      message: string;
      ambiguous: boolean;
      retryAfterSeconds?: number;
    };
export interface TelegramOptions {
  fetch?: typeof globalThis.fetch;
  token?: string;
  timeoutMs?: number;
}
export function isTelegramConfigured(
  token = process.env.TELEGRAM_BOT_TOKEN ?? "",
): boolean {
  return /^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(token);
}
const unknownOutcome = (): TelegramResult => ({
  ok: false,
  code: "ambiguous",
  ambiguous: true,
  message:
    "Telegram delivery could not be confirmed. The message may have arrived. Check the destination before explicitly retrying; a retry could send a duplicate.",
});
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
async function readReply(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Missing response");
  const reader = response.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) {
        void reader.cancel().catch(() => {});
        throw new Error("Response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export async function sendTelegramMessage(
  input: { chatId: string; text: string },
  options: TelegramOptions = {},
): Promise<TelegramResult> {
  const token = options.token ?? process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!isTelegramConfigured(token))
    return {
      ok: false,
      code: "missing_credentials",
      ambiguous: false,
      message:
        "Telegram bot credentials are missing or invalid. Configure the server bot token before retrying.",
    };
  if (
    !/^-?[1-9]\d{0,15}$/.test(input.chatId) ||
    Math.abs(Number(input.chatId)) > 2 ** 52 - 1
  )
    return {
      ok: false,
      code: "invalid_chat",
      ambiguous: false,
      message: "A valid numeric Telegram destination is required.",
    };
  // UTF-16 length is conservative for Telegram's 4096-character maximum. Never
  // silently truncate a contractor's list or split one auditable delivery.
  if (!input.text.length || input.text.length > 4096)
    return {
      ok: false,
      code: "invalid_message",
      ambiguous: false,
      message:
        "The notification must contain between 1 and 4096 characters. No message was sent.",
    };
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.min(8000, Math.max(1, options.timeoutMs!))
    : 8000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<TelegramResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(unknownOutcome());
    }, timeoutMs);
  });
  const send = async (): Promise<TelegramResult> => {
    try {
      const response = await (options.fetch ?? globalThis.fetch)(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: input.chatId,
            text: input.text,
            link_preview_options: { is_disabled: true },
          }),
        },
      );
      // Server errors cannot prove Telegram did not process the request.
      if (response.status >= 500) {
        void response.body?.cancel().catch(() => {});
        return unknownOutcome();
      }
      const body = object(await readReply(response));
      if (response.status === 429 || body?.error_code === 429) {
        const retry = object(body?.parameters)?.retry_after;
        return {
          ok: false,
          code: "rate_limited",
          ambiguous: false,
          message:
            "Telegram rate-limited this delivery. Wait until the retry time, then retry explicitly.",
          ...(typeof retry === "number" &&
          Number.isSafeInteger(retry) &&
          retry >= 0 &&
          retry <= 86400
            ? { retryAfterSeconds: retry }
            : {}),
        };
      }
      if (
        body?.ok === false &&
        typeof body.error_code === "number" &&
        body.error_code >= 400 &&
        body.error_code < 500
      )
        return {
          ok: false,
          code: "rejected",
          ambiguous: false,
          message:
            "Telegram rejected the delivery. Check the bot's access and the configured destination before retrying.",
        };
      const result = object(body?.result);
      const chat = object(result?.chat);
      if (
        response.ok &&
        body?.ok === true &&
        typeof result?.message_id === "number" &&
        Number.isSafeInteger(result.message_id) &&
        result.message_id > 0 &&
        chat?.id === Number(input.chatId)
      ) {
        return { ok: true, messageId: String(result.message_id) };
      }
      return unknownOutcome();
    } catch {
      return unknownOutcome();
    }
  };
  try {
    return await Promise.race([send(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
