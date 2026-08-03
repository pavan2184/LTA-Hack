import { existsSync } from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { buildDisruptionInputs, disruptionById } from "@/data/disruptions";
import { reviewSubmittedPlan, solve } from "@/engine/solve";
import { answerDeterministically } from "@/lib/assistant/deterministic";
import { buildFactSet } from "@/lib/assistant/facts";
import { checkGrounding, FALLBACK_NOTICE, SYSTEM_PROMPT } from "@/lib/assistant/guard";
import { apiError, newRequestId } from "@/lib/http/errors";
import { requestLogger } from "@/lib/http/logger";
import { clientKey, consume } from "@/lib/http/rateLimit";
import { assistantRequestSchema, describeIssue, MAX_BODY_BYTES } from "@/lib/http/schemas";

export const runtime = "nodejs";
/** Ceiling for the whole handler, above the worst case of the model call below. */
export const maxDuration = 30;

export type AssistantMode = "model" | "engine";

export interface AssistantResponse {
  answer: string;
  mode: AssistantMode;
  /** Why the model answer was not used, when it was not. */
  notice: string | null;
  /** Numeric claims rejected by the grounding check, if any. */
  rejected: string[];
  model: string | null;
}

/**
 * The assistant endpoint.
 *
 * The client sends the question and the parameters that identify the plan — not
 * the plan itself. The server re-solves from those parameters and builds its own
 * fact set, so nothing the browser sends can become a fact the model repeats.
 *
 * Every input is bounded before it reaches the engine. That is not tidiness:
 * `locked` is re-validated at every candidate start inside the solver, so an
 * unbounded array turns one request into arbitrary server CPU.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  const log = requestLogger(requestId, "POST /api/assistant");
  const startedAt = Date.now();

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    log.warn({ declaredLength }, "request body over limit");
    return apiError("payload_too_large", "The request is too large.", requestId);
  }

  const limit = consume(clientKey(request));
  if (!limit.allowed) {
    log.warn({ retryAfterSeconds: limit.retryAfterSeconds }, "rate limited");
    return apiError("rate_limited", "Too many questions at once. Try again shortly.", requestId, {
      "retry-after": String(limit.retryAfterSeconds),
    });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("malformed_request", "The request body was not valid JSON.", requestId);
  }

  const parsed = assistantRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = describeIssue(parsed.error);
    log.warn({ detail }, "request failed validation");
    return apiError("invalid_request", detail, requestId);
  }
  const body = parsed.data;

  // The engine runs inside the guard, not outside it. An unvalidated strategy
  // used to reach `strategyProfiles[unknown]` and throw an unhandled 500; the
  // schema now makes that unreachable, and this catch means a future engine
  // fault is still reported as a typed error rather than a stack trace.
  let result;
  let facts;
  let deterministic;
  try {
    const scenario = body.disruptionId ? disruptionById[body.disruptionId] : null;
    const locked = body.locked.map((placement) => ({ ...placement, locked: true }));
    const inputs = scenario ? buildDisruptionInputs(scenario, locked) : null;

    result =
      body.view === "planned"
        ? solve({
            strategy: body.strategy,
            locked: [...locked, ...(inputs?.locked ?? [])],
            requests: inputs?.requests,
            context: inputs?.context,
          })
        : reviewSubmittedPlan(inputs?.context);

    facts = buildFactSet(result, body.view);
    deterministic = answerDeterministically(body.question, result);
  } catch (error) {
    log.error({ err: error }, "engine failed to build a plan");
    return apiError(
      "engine_error",
      "The planning engine could not evaluate that request.",
      requestId,
    );
  }

  const respond = (payload: AssistantResponse, outcome: string) => {
    log.info({ outcome, mode: payload.mode, ms: Date.now() - startedAt }, "assistant answered");
    return NextResponse.json<AssistantResponse>(payload, { headers: { "x-request-id": requestId } });
  };

  if (!hasCredentials()) {
    return respond(
      {
        answer: deterministic,
        mode: "engine",
        notice: "No ANTHROPIC_API_KEY is set, so the engine answered directly.",
        rejected: [],
        model: null,
      },
      "no-credentials",
    );
  }

  try {
    const client = new Anthropic();
    const message = await client.messages.create(
      {
        model: MODEL,
        // Adaptive thinking is on by default on this model and `max_tokens`
        // caps thinking *and* the reply together, so this is not sized for a
        // four-sentence answer alone. A truncated reply is caught below rather
        // than shown.
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        // Enough reasoning to pick the right facts, without the latency of a
        // deep pass on a chat turn.
        output_config: { effort: "low" },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            // Stable across every turn, so it caches; the volatile fact set
            // goes in the user message after this breakpoint.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: buildPrompt(facts.text, body.question, body.history) }],
      },
      // The SDK retries timeouts, so a bare timeout is not a bound — the pair
      // is. Worst case here is 24s, inside the handler's own ceiling.
      { timeout: 12_000, maxRetries: 1 },
    );

    logUsage(log, message);

    if (message.stop_reason === "refusal") {
      return respond(
        {
          answer: deterministic,
          mode: "engine",
          notice: "The model declined to answer, so the engine answered directly.",
          rejected: [],
          model: MODEL,
        },
        "refusal",
      );
    }

    // A truncated answer can end mid-sentence and still contain only grounded
    // figures, so the grounding check would pass it. Length is checked first.
    if (message.stop_reason === "max_tokens") {
      log.warn("model answer hit the token ceiling");
      return respond(
        {
          answer: deterministic,
          mode: "engine",
          notice: "The model's answer was cut short, so the engine answered directly.",
          rejected: [],
          model: MODEL,
        },
        "truncated",
      );
    }

    const answer = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!answer) {
      return respond(
        {
          answer: deterministic,
          mode: "engine",
          notice: "The model returned no text, so the engine answered directly.",
          rejected: [],
          model: MODEL,
        },
        "empty",
      );
    }

    const grounding = checkGrounding(answer, facts.allowedNumbers);
    if (!grounding.grounded) {
      log.warn({ unsupported: grounding.unsupported.slice(0, 8) }, "answer failed grounding");
      return respond(
        {
          answer: deterministic,
          mode: "engine",
          notice: `${FALLBACK_NOTICE} The model's answer used ${grounding.unsupported.length} figure${grounding.unsupported.length > 1 ? "s" : ""} the engine never produced (${grounding.unsupported.slice(0, 4).join(", ")}), so it was discarded.`,
          rejected: grounding.unsupported,
          model: MODEL,
        },
        "ungrounded",
      );
    }

    return respond(
      { answer, mode: "model", notice: null, rejected: [], model: MODEL },
      "grounded",
    );
  } catch (error) {
    log.error({ err: error }, "model call failed");
    return respond(
      {
        answer: deterministic,
        mode: "engine",
        // The planner is told the model was unreachable, not what it said.
        // Upstream error text can carry request details that do not belong in
        // a browser.
        notice: "The model could not be reached, so the engine answered directly.",
        rejected: [],
        model: MODEL,
      },
      "model-unreachable",
    );
  }
}

const MODEL = "claude-opus-5";

/** Per million tokens, for the cost estimate in the log line. */
const USD_PER_M_INPUT = 5;
const USD_PER_M_OUTPUT = 25;

/**
 * One user turn carrying the facts, the question, and any earlier questions.
 *
 * Earlier turns are folded in as quoted context rather than replayed as
 * conversation. The client used to send its own assistant turns back, which let
 * any caller put words in the assistant's mouth; the schema now accepts only
 * what the planner asked, and this keeps those turns clearly marked as the
 * planner's own words.
 */
function buildPrompt(facts: string, question: string, history: { content: string }[]): string {
  const earlier = history.length
    ? `Earlier questions from this planner, for context only:\n${history
        .map((turn) => `- ${turn.content}`)
        .join("\n")}\n\n`
    : "";
  return `FACTS\n=====\n${facts}\n=====\n\n${earlier}Planner's question: ${question}`;
}

function logUsage(log: ReturnType<typeof requestLogger>, message: Anthropic.Message): void {
  const usage = message.usage;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  // Cache reads bill at ~0.1x input and writes at ~1.25x, so a flat input rate
  // would misreport the cost of exactly the turns caching is meant to help.
  const usd =
    (usage.input_tokens * USD_PER_M_INPUT +
      cacheWrite * USD_PER_M_INPUT * 1.25 +
      cacheRead * USD_PER_M_INPUT * 0.1 +
      usage.output_tokens * USD_PER_M_OUTPUT) /
    1_000_000;

  log.info(
    {
      model: MODEL,
      stopReason: message.stop_reason,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      estimatedUsd: Number(usd.toFixed(6)),
    },
    "model call complete",
  );
}

/**
 * An unset ANTHROPIC_API_KEY does not mean there are no credentials — the SDK
 * also resolves an OAuth profile written by `ant auth login`. Check for that
 * too, so a developer who logged in rather than exporting a key still gets the
 * model path instead of a silent downgrade to template answers.
 *
 * Resolved once. It used to run a filesystem stat on every request.
 */
let credentialsPresent: boolean | null = null;

function hasCredentials(): boolean {
  if (credentialsPresent !== null) return credentialsPresent;
  credentialsPresent = resolveCredentials();
  return credentialsPresent;
}

function resolveCredentials(): boolean {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  const configDir =
    process.env.ANTHROPIC_CONFIG_DIR ??
    (process.env.HOME ? `${process.env.HOME}/.config/anthropic` : null);
  if (!configDir) return false;
  try {
    return existsSync(`${configDir}/credentials`);
  } catch {
    return false;
  }
}
