import { existsSync } from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { buildDisruptionInputs, disruptionById } from "@/data/disruptions";
import { reviewSubmittedPlan, solve } from "@/engine/solve";
import { answerDeterministically } from "@/lib/assistant/deterministic";
import { buildFactSet } from "@/lib/assistant/facts";
import { checkGrounding, FALLBACK_NOTICE, SYSTEM_PROMPT } from "@/lib/assistant/guard";
import type { Placement, StrategyId } from "@/types/railplan";

export const runtime = "nodejs";

interface AssistantRequest {
  question: string;
  strategy: StrategyId;
  view: "submitted" | "planned";
  locked: Placement[];
  disruptionId: string | null;
  history: { role: "user" | "assistant"; content: string }[];
}

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
 */
export async function POST(request: Request) {
  let body: AssistantRequest;
  try {
    body = (await request.json()) as AssistantRequest;
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const question = (body.question ?? "").trim().slice(0, 2000);
  if (!question) {
    return NextResponse.json({ error: "No question supplied" }, { status: 400 });
  }

  const scenario = body.disruptionId ? disruptionById[body.disruptionId] : null;
  const inputs = scenario ? buildDisruptionInputs(scenario, body.locked ?? []) : null;

  const result =
    body.view === "planned"
      ? solve({
          strategy: body.strategy ?? "balanced",
          locked: [...(body.locked ?? []), ...(inputs?.locked ?? [])],
          requests: inputs?.requests,
          context: inputs?.context,
        })
      : reviewSubmittedPlan(inputs?.context);

  const facts = buildFactSet(result, body.view === "planned" ? "planned" : "submitted");
  const deterministic = answerDeterministically(question, result);

  if (!hasCredentials()) {
    return NextResponse.json<AssistantResponse>({
      answer: deterministic,
      mode: "engine",
      notice: "No ANTHROPIC_API_KEY is set, so the engine answered directly.",
      rejected: [],
      model: null,
    });
  }

  const history = (body.history ?? [])
    .slice(-6)
    .filter((entry) => entry.content?.trim())
    .map((entry) => ({ role: entry.role, content: entry.content.slice(0, 4000) }));

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      // Adaptive thinking at low effort: enough reasoning to pick the right
      // facts, without the latency of a deep pass on a chat turn.
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // Stable across every turn, so it caches; the volatile fact set goes
          // in the user message after this breakpoint.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        ...history,
        {
          role: "user",
          content: `FACTS\n=====\n${facts.text}\n=====\n\nPlanner's question: ${question}`,
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      return NextResponse.json<AssistantResponse>({
        answer: deterministic,
        mode: "engine",
        notice: "The model declined to answer, so the engine answered directly.",
        rejected: [],
        model: MODEL,
      });
    }

    const answer = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!answer) {
      return NextResponse.json<AssistantResponse>({
        answer: deterministic,
        mode: "engine",
        notice: "The model returned no text, so the engine answered directly.",
        rejected: [],
        model: MODEL,
      });
    }

    const grounding = checkGrounding(answer, facts.allowedNumbers);
    if (!grounding.grounded) {
      return NextResponse.json<AssistantResponse>({
        answer: deterministic,
        mode: "engine",
        notice: `${FALLBACK_NOTICE} The model's answer used ${grounding.unsupported.length} figure${grounding.unsupported.length > 1 ? "s" : ""} the engine never produced (${grounding.unsupported.slice(0, 4).join(", ")}), so it was discarded.`,
        rejected: grounding.unsupported,
        model: MODEL,
      });
    }

    return NextResponse.json<AssistantResponse>({
      answer,
      mode: "model",
      notice: null,
      rejected: [],
      model: MODEL,
    });
  } catch (error) {
    return NextResponse.json<AssistantResponse>({
      answer: deterministic,
      mode: "engine",
      notice: `The model could not be reached (${error instanceof Error ? error.message.slice(0, 160) : "unknown error"}), so the engine answered directly.`,
      rejected: [],
      model: MODEL,
    });
  }
}

const MODEL = "claude-opus-5";

/**
 * An unset ANTHROPIC_API_KEY does not mean there are no credentials — the SDK
 * also resolves an OAuth profile written by `ant auth login`. Check for that
 * too, so a developer who logged in rather than exporting a key still gets the
 * model path instead of a silent downgrade to template answers.
 */
function hasCredentials(): boolean {
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
