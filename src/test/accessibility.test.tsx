import { readFileSync } from "node:fs";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { SandboxLegacyDashboard } from "@/test/fixtures/SandboxLegacyDashboard";
import { PlannerAssistant } from "@/components/assistant/PlannerAssistant";
import { useRailPlanStore } from "@/store/useRailPlanStore";

beforeEach(() => {
  localStorage.clear();
  useRailPlanStore.setState({
    loaded: false,
    submitted: null,
    planned: null,
    stage: "idle",
    strategy: "balanced",
    view: "submitted",
    locked: {},
    overrides: {},
    selectedRequestId: null,
    selectedViolationId: null,
    activeDisruptionId: null,
    hasReplanned: false,
    disruptionImpact: [],
    disruptionPlacements: [],
    disruptionMetrics: null,
  });
});
afterEach(() => vi.unstubAllGlobals());

it.each(["Escape", "Cancel", "Apply to this plan"])(
  "restores keyboard focus after closing the disruption dialog with %s",
  async (action) => {
    await useRailPlanStore.getState().load();
    render(
      <DashboardShell>
        <SandboxLegacyDashboard />
      </DashboardShell>,
    );
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Test a disruption" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Test a disruption" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(dialog).toHaveClass("max-h-[calc(100dvh-32px)]", "overflow-y-auto");
    const close = within(dialog).getByRole("button", { name: "Close" });
    close.focus();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    if (action === "Escape") await user.keyboard("{Escape}");
    else {
      within(dialog).getByRole("button", { name: action }).focus();
      await user.keyboard("{Enter}");
    }
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  },
);

it.each(["success", "http", "network"])(
  "announces a new assistant %s result without announcing previous conversation again",
  async (mode) => {
    let finish!: (response: Response) => void;
    let fail!: (error: Error) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve, reject) => {
            finish = resolve;
            fail = reject;
          }),
      ),
    );
    render(<PlannerAssistant />);
    const user = userEvent.setup();
    const input = screen.getByRole("textbox", { name: "Ask about this plan" });
    await user.type(input, "Why did work move?{Enter}");
    const status = screen.getByRole("status", { name: "Assistant response" });
    expect(status).toHaveTextContent("Checking the plan");
    expect(input).toHaveFocus();
    const answer =
      mode === "success"
        ? "The engine checked this placement."
        : mode === "http"
          ? "The assistant is unavailable."
          : "The assistant could not be reached.";
    await act(async () => {
      if (mode === "network") fail(new Error("offline"));
      else
        finish(
          Response.json(
            mode === "success"
              ? {
                  answer,
                  mode: "engine",
                  notice: "No optional model configured.",
                }
              : { error: { message: answer, requestId: "test-reference" } },
            { status: mode === "http" ? 503 : 200 },
          ),
        );
    });
    expect(status).toHaveTextContent(answer);
    expect(status).not.toHaveTextContent("Why did work move?");
    expect(input).toHaveFocus();
    expect(input).toBeEnabled();
  },
);

const css = readFileSync("src/app/globals.css", "utf8");
function color(token: string) {
  const hex = css.match(new RegExp(`--color-${token}: #([a-f0-9]{6})`))![1];
  const [r, g, b] = hex.match(/../g)!.map((value) => {
    const component = parseInt(value, 16) / 255;
    return component <= 0.04045
      ? component / 12.92
      : ((component + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
it.each([
  ["ink-400", "surface"],
  ["ink-400", "paper"],
  ["ink-400", "sunk"],
  ["ink-500", "surface"],
  ["ink-500", "paper"],
  ["ink-500", "sunk"],
  ["signal-amber", "surface"],
  ["signal-amber", "paper"],
  ["signal-amber", "signal-amber-soft"],
  ["cf-compatibility", "cf-compatibility-soft"],
  ["line-ns-ink", "line-ns-tint"],
  ["line-ew-ink", "line-ew-tint"],
  ["line-cc-ink", "line-cc-tint"],
])("keeps enabled small %s text readable on %s", (foreground, background) => {
  const a = color(foreground);
  const b = color(background);
  expect(
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
  ).toBeGreaterThanOrEqual(4.5);
});
