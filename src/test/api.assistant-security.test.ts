// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  consume: vi.fn(),
  create: vi.fn(),
  constructor: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireActor: mocks.actor }));
vi.mock("@/lib/auth/rate-limit", () => ({
  consumeAssistantToken: mocks.consume,
}));
vi.mock("@/lib/http/logger", () => ({
  requestLogger: () => ({
    error: mocks.error,
    warn: mocks.warn,
    info: mocks.info,
  }),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mocks.create };
    constructor(options: unknown) {
      mocks.constructor(options);
    }
  },
}));
vi.mock("@railplan/core/engine/solve", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@railplan/core/engine/solve")>();
  return { ...actual, solve: vi.fn(actual.solve) };
});
import { solve } from "@railplan/core/engine/solve";
import { POST } from "@/app/api/assistant/route";
const body = {
  question: "Explain the current plan.",
  strategy: "balanced",
  view: "planned",
  locked: [],
  disruptionId: null,
  history: [],
};
const request = (
  headers: Record<string, string> = {
    origin: "http://localhost",
    "content-type": "application/json",
  },
  value: unknown = body,
) =>
  new Request("http://localhost/api/assistant", {
    method: "POST",
    headers,
    body: JSON.stringify(value),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    identity: { id: "planner" },
    actor: { role: "planner" },
  });
  mocks.consume.mockResolvedValue({
    allowed: true,
    remaining: 5,
    retryAfterSeconds: 0,
  });
  vi.stubEnv("ANTHROPIC_API_KEY", "controlled-test-only");
});
afterEach(() => vi.unstubAllEnvs());
it.each(["https://other.example", "null", "http://localhost:3001"])(
  "rejects origin %s before consuming quota or calling a provider",
  async (origin) => {
    const response = await POST(
      request({ origin, "content-type": "application/json" }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("forbidden");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  },
);
it.each(["text/plain", "application/x-www-form-urlencoded", ""])(
  "rejects simple non-JSON content type %s before quota",
  async (type) => {
    const response = await POST(
      request({
        origin: "http://localhost",
        ...(type ? { "content-type": type } : {}),
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(mocks.consume).not.toHaveBeenCalled();
  },
);
it("suppresses provider exception details and SDK logging while preserving the engine fallback", async () => {
  const secret = "PRIVATE_PROMPT_AND_PROVIDER_TOKEN";
  mocks.create.mockRejectedValueOnce(
    Object.assign(new Error(secret), {
      error: { message: secret },
      headers: { authorization: secret },
    }),
  );
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect((await response.json()).mode).toBe("engine");
  expect(mocks.constructor).toHaveBeenCalledWith(
    expect.objectContaining({ logLevel: "off" }),
  );
  expect(
    JSON.stringify([
      mocks.error.mock.calls,
      mocks.warn.mock.calls,
      mocks.info.mock.calls,
    ]),
  ).not.toContain(secret);
  expect(mocks.error).toHaveBeenCalledWith("model call failed");
});
it("does not log raw engine exceptions or unrecognized request field names", async () => {
  const secret = "PRIVATE_ENGINE_AND_FIELD_CONTENT";
  vi.mocked(solve).mockImplementationOnce(() => {
    throw new Error(secret);
  });
  expect((await POST(request())).status).toBe(500);
  expect(
    (
      await POST(
        request(undefined, {
          ...body,
          question: { [secret]: "private-value" },
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    JSON.stringify([
      mocks.error.mock.calls,
      mocks.warn.mock.calls,
      mocks.info.mock.calls,
    ]),
  ).not.toContain(secret);
});
it("logs only counts for rejected model figures and bounded numeric usage", async () => {
  const privateNumber = "987654321012345";
  mocks.create.mockResolvedValueOnce({
    content: [
      {
        type: "text",
        text: `Account ${privateNumber} has ${privateNumber} units.`,
      },
    ],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 5,
      output_tokens: 10,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  });
  const response = await POST(request());
  expect((await response.json()).mode).toBe("engine");
  expect(
    JSON.stringify([mocks.warn.mock.calls, mocks.info.mock.calls]),
  ).not.toContain(privateNumber);
});
it("does not serialize arbitrary provider usage metadata into logs", async () => {
  const secret = "PRIVATE_USAGE_METADATA";
  mocks.create.mockResolvedValueOnce({
    content: [
      { type: "text", text: "Review the recorded validation findings." },
    ],
    stop_reason: secret,
    usage: {
      input_tokens: { private: secret },
      output_tokens: secret,
      cache_read_input_tokens: -1,
      cache_creation_input_tokens: Infinity,
    },
  });
  expect((await POST(request())).status).toBe(200);
  expect(JSON.stringify(mocks.info.mock.calls)).not.toContain(secret);
  expect(mocks.info).toHaveBeenCalledWith(
    expect.objectContaining({
      stopReason: "unknown",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }),
    "model call complete",
  );
});
