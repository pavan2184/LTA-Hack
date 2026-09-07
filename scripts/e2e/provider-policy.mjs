// This module is loaded only by the isolated test child, never by application code.
export const transcriptTitle = "E2E transcript inspection";
export function controlledFetch(realFetch, authOrigin) {
  const counts = { anthropic: 0, telegram: 0, blocked: 0 };
  const attempts = new Map();
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  return {
    counts,
    fetch: async (input, init) => {
      const url = new URL(
        typeof input === "string" || input instanceof URL ? input : input.url,
      );
      if (
        url.protocol === "https:" &&
        url.origin === authOrigin &&
        url.pathname.startsWith("/auth/v1/")
      )
        return realFetch(input, { ...init, redirect: "error" });
      if (
        url.origin === "https://api.anthropic.com" &&
        url.pathname === "/v1/messages"
      ) {
        counts.anthropic++;
        const keys = [
          "planningNight",
          "title",
          "description",
          "workClass",
          "blockIds",
          "durationMinutes",
          "preferredStart",
          "earliestStart",
          "latestEnd",
          "equipment",
          "workforce",
        ];
        const fields = Object.fromEntries(
          keys.map((key) => [key, key === "title" ? transcriptTitle : null]),
        );
        const confidence = Object.fromEntries(
          keys.map((key) => [key, key === "title" ? 0.8 : null]),
        );
        return reply({
          id: "msg_e2e_controlled",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                drafts: [
                  {
                    fields,
                    confidence,
                    evidence: [
                      {
                        field: "title",
                        quote: transcriptTitle,
                        timestamp: null,
                      },
                    ],
                  },
                ],
              }),
            },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      }
      if (
        url.origin === "https://api.telegram.org" &&
        /^\/bot[^/]+\/sendMessage$/.test(url.pathname)
      ) {
        counts.telegram++;
        const body = JSON.parse(
          typeof init?.body === "string"
            ? init.body
            : await input.clone().text(),
        );
        const key = JSON.stringify([body.chat_id, body.text]);
        const attempt = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, attempt);
        if (attempt === 1)
          return reply(
            {
              ok: false,
              error_code: 400,
              description: "Controlled provider failure",
            },
            400,
          );
        return reply({
          ok: true,
          result: {
            message_id: 17001,
            chat: { id: Number(body.chat_id) },
            text: body.text,
          },
        });
      }
      counts.blocked++;
      throw new Error("E2E external request blocked");
    },
  };
}
