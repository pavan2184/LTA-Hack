// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTelegramMessage } from "@/lib/notifications/telegram";

const token = "123456789:controlled_test_token_not_a_real_secret";
const message = {
  chatId: "-1001234567890",
  text: "RailPlan prototype · M-001 01:00–01:30",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const success = () =>
  reply({ ok: true, result: { message_id: 42, chat: { id: -1001234567890 } } });
afterEach(() => vi.useRealTimers());

describe("Telegram transport trust boundary", () => {
  it("sends one plain-text POST to the fixed HTTPS endpoint and records only a matching message ID", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(success());
    expect(
      await sendTelegramMessage(message, { token, fetch: fetcher }),
    ).toEqual({ ok: true, messageId: "42" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${token}/sendMessage`);
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      cache: "no-store",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: message.chatId,
      text: message.text,
      link_preview_options: { is_disabled: true },
    });
  });
  it.each(["", "bad/token?leak=yes", "valid:but-not-a-bot-token"])(
    "refuses missing or malformed credentials before any call (%s)",
    async (tokenValue) => {
      const fetcher = vi.fn<typeof fetch>();
      expect(
        await sendTelegramMessage(message, {
          token: tokenValue,
          fetch: fetcher,
        }),
      ).toMatchObject({
        ok: false,
        code: "missing_credentials",
        ambiguous: false,
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each([
    "0",
    "-0",
    "01",
    "+1",
    "@arbitraryChannel",
    "1/elsewhere",
    "4503599627370496",
    "NaN",
  ])("rejects invalid chat ID %s", async (chatId) => {
    const fetcher = vi.fn<typeof fetch>();
    expect(
      await sendTelegramMessage(
        { ...message, chatId },
        { token, fetch: fetcher },
      ),
    ).toMatchObject({ code: "invalid_chat", ambiguous: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["", "x".repeat(4097)])(
    "does not truncate empty or oversized messages",
    async (text) => {
      const fetcher = vi.fn<typeof fetch>();
      expect(
        await sendTelegramMessage(
          { ...message, text },
          { token, fetch: fetcher },
        ),
      ).toMatchObject({ code: "invalid_message", ambiguous: false });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each([400, 401, 403])(
    "sanitizes definitive Telegram %i rejection",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          reply(
            {
              ok: false,
              error_code: status,
              description: `Upstream leaked ${token}`,
            },
            status,
          ),
        );
      const result = await sendTelegramMessage(message, {
        token,
        fetch: fetcher,
      });
      expect(result).toMatchObject({
        ok: false,
        code: "rejected",
        ambiguous: false,
      });
      expect(JSON.stringify(result)).not.toContain(token);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("retains a bounded rate-limit delay without retrying", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        reply(
          {
            ok: false,
            error_code: 429,
            parameters: { retry_after: 37 },
            description: token,
          },
          429,
        ),
      );
    expect(
      await sendTelegramMessage(message, { token, fetch: fetcher }),
    ).toMatchObject({
      code: "rate_limited",
      ambiguous: false,
      retryAfterSeconds: 37,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([-1, Infinity, "99", 9000000000])(
    "does not propagate malformed retry delay %s",
    async (retry_after) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          reply(
            { ok: false, error_code: 429, parameters: { retry_after } },
            429,
          ),
        );
      expect(
        await sendTelegramMessage(message, { token, fetch: fetcher }),
      ).not.toHaveProperty("retryAfterSeconds");
    },
  );
  it.each([500, 502, 503])(
    "labels server %i outcome unknown rather than safely retryable",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(reply({ description: token }, status));
      expect(
        await sendTelegramMessage(message, { token, fetch: fetcher }),
      ).toMatchObject({ code: "ambiguous", ambiguous: true });
    },
  );
  it("sanitizes network failure and does not retry", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        new Error(`https://api.telegram.org/bot${token}/sendMessage`),
      );
    const result = await sendTelegramMessage(message, {
      token,
      fetch: fetcher,
    });
    expect(result).toMatchObject({ code: "ambiguous", ambiguous: true });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("aborts a timed-out request and makes ambiguity explicit", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise(() => {}));
    const pending = sendTelegramMessage(message, {
      token,
      fetch: fetcher,
      timeoutMs: 50,
    });
    await vi.advanceTimersByTimeAsync(51);
    expect(await pending).toMatchObject({ code: "ambiguous", ambiguous: true });
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ok: true, result: { message_id: 0, chat: { id: -1001234567890 } } },
    { ok: true, result: { message_id: 42, chat: { id: 999 } } },
    { ok: true, result: { message_id: 42 } },
    { ok: false },
  ])(
    "does not claim success for malformed or wrong-chat acknowledgement",
    async (body) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(body));
      expect(
        await sendTelegramMessage(message, { token, fetch: fetcher }),
      ).toMatchObject({ code: "ambiguous", ambiguous: true });
    },
  );
  it("bounds an upstream response body and ignores its contents", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("x".repeat(70000)));
    expect(
      await sendTelegramMessage(message, { token, fetch: fetcher }),
    ).toMatchObject({ code: "ambiguous", ambiguous: true });
  });
  it("also times out after response headers when the body stalls", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new ReadableStream({ start() {} })));
    const pending = sendTelegramMessage(message, {
      token,
      fetch: fetcher,
      timeoutMs: 50,
    });
    await vi.advanceTimersByTimeAsync(51);
    expect(await pending).toMatchObject({ code: "ambiguous", ambiguous: true });
  });
});
