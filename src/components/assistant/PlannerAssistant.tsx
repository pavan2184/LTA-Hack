"use client";

import { CornerDownLeft } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import type { AssistantResponse } from "@/app/api/assistant/route";
import type { ApiError } from "@/lib/http/errors";
import { suggestedQuestions } from "@/lib/assistant/deterministic";
import { cn } from "@/lib/utils";
import { useRailPlanStore } from "@/store/useRailPlanStore";

/**
 * Planner assistant.
 *
 * It reads the engine's output and nothing else. The server rebuilds the plan
 * from the same parameters the dashboard is showing, hands the model a fact
 * sheet, and rejects any answer containing a figure that is not in it. When the
 * model is unavailable or fails that check, the engine answers directly — the
 * assistant gets terser, never less accurate.
 */
export function PlannerAssistant() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const turns = useRailPlanStore((state) => state.assistantTurns);
  const input = useRailPlanStore((state) => state.assistantInput);
  const pending = useRailPlanStore((state) => state.assistantPending);
  const setInput = useRailPlanStore((state) => state.setAssistantInput);
  const setPending = useRailPlanStore((state) => state.setAssistantPending);
  const appendTurn = useRailPlanStore((state) => state.appendAssistantTurn);
  const strategy = useRailPlanStore((state) => state.strategy);
  const view = useRailPlanStore((state) => state.view);
  const locked = useRailPlanStore((state) => state.locked);
  const activeDisruptionId = useRailPlanStore((state) => state.activeDisruptionId);
  const result = useRailPlanStore((state) => state.activeResult());
  const selectRequest = useRailPlanStore((state) => state.selectRequest);

  const suggestions = useMemo(() => (result ? suggestedQuestions(result) : []), [result]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns, pending]);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    // Only the planner's own questions are sent. Replaying our previous answers
    // back to the server would let anything posting to the route put words in
    // the assistant's mouth, so the server no longer accepts them.
    const history = turns
      .filter((turn) => turn.role === "user")
      .slice(-6)
      .map((turn) => ({ role: "user" as const, content: turn.content }));
    const requestEpoch = useRailPlanStore.getState().assistantRequestEpoch;
    const requestIsCurrent = () =>
      useRailPlanStore.getState().assistantRequestEpoch === requestEpoch;
    appendTurn({ role: "user", content: trimmed });
    setInput("");
    setPending(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          strategy,
          view,
          locked: Object.values(locked),
          disruptionId: activeDisruptionId,
          history,
        }),
      });

      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as ApiError | null;
        if (!requestIsCurrent()) return;
        appendTurn({
          role: "assistant",
          content:
            failure?.error.message ??
            "The assistant could not answer that. The plan and its figures are unaffected.",
          mode: "engine",
          notice: failure ? `Reference ${failure.error.requestId}` : null,
        });
        return;
      }

      const data = (await response.json()) as AssistantResponse;
      if (!requestIsCurrent()) return;
      appendTurn({
        role: "assistant",
        content: data.answer,
        mode: data.mode,
        notice: data.notice,
      });
    } catch {
      if (!requestIsCurrent()) return;
      appendTurn({
        role: "assistant",
        content: "The assistant could not be reached. The plan and its figures are unaffected.",
        mode: "engine",
        notice: null,
      });
    } finally {
      if (requestIsCurrent()) setPending(false);
    }
  };

  const latestAnswer = turns.at(-1)?.role === "assistant" ? turns.at(-1) : null;

  return (
    <section className="flex min-h-0 flex-col border border-rule bg-surface">
      <header className="flex items-baseline justify-between border-b border-rule px-3 py-2">
        <h2 className="text-[13px] font-semibold text-ink-900">Ask about this plan</h2>
        <span className="text-[11px] text-ink-500">reads solver output only</span>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-[12px] leading-relaxed text-ink-500">
              Every figure in an answer is traceable to the engine. Numbers the engine did not produce are
              rejected before you see them.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => ask(suggestion)}
                  className="rounded-xs border border-rule px-1.5 py-1 text-left text-[11px] text-ink-700 hover:border-accent hover:bg-accent-soft"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <ol className="space-y-3">
          {turns.map((turn, index) => (
            <li key={index}>
              {turn.role === "user" ? (
                <p className="text-[12px] font-medium text-ink-900">{turn.content}</p>
              ) : (
                <div>
                  <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-ink-700">
                    <RequestLinks text={turn.content} onSelect={selectRequest} />
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[11px]",
                      turn.mode === "engine" ? "text-signal-amber" : "text-ink-400",
                    )}
                  >
                    {turn.mode === "engine"
                      ? (turn.notice ?? "Answered by the engine directly.")
                      : "Grounded: every figure checked against engine output."}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ol>

        {pending && <p className="mt-3 text-[12px] text-ink-400">Checking the plan…</p>}
        <p role="status" aria-label="Assistant response" aria-live="polite" aria-atomic="true" className="sr-only">
          {pending ? "Checking the plan…" : latestAnswer
            ? `${latestAnswer.content} ${latestAnswer.notice ?? (latestAnswer.mode === "engine" ? "Answered by the engine directly." : "Grounded: every figure checked against engine output.")}`
            : ""}
        </p>
      </div>

      <form
        className="flex items-center gap-1.5 border-t border-rule p-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          readOnly={pending}
          aria-busy={pending}
          placeholder="Why did M-014 move?"
          aria-label="Ask about this plan"
          className="h-7 min-w-0 flex-1 rounded-sm border border-rule bg-paper px-2 text-[12px] placeholder:text-ink-400 focus:border-accent focus:bg-surface"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          aria-label="Send question"
          className="flex h-7 w-7 items-center justify-center rounded-sm border border-rule-strong text-ink-700 hover:bg-sunk disabled:text-ink-400"
        >
          <CornerDownLeft className="size-3.5" />
        </button>
      </form>
    </section>
  );
}

/** Turn request ids in the answer into selectors for that request. */
function RequestLinks({ text, onSelect }: { text: string; onSelect: (id: string) => void }) {
  const parts = text.split(/\b(M-\d{3}|EM-\d{3})\b/g);
  return (
    <>
      {parts.map((part, index) =>
        /^(M|EM)-\d{3}$/.test(part) ? (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(part)}
            className="font-mono text-ink-900 underline decoration-rule-strong underline-offset-2 hover:decoration-ink-900"
          >
            {part}
          </button>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}
