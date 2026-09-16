import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
export const origin = "http://127.0.0.1:3101";
export const fakeAnthropicKey = "sk-ant-e2e-fake-not-a-real-key";
export const fakeTelegramToken = "123456:e2e_fake_not_a_real_bot_secret";
export async function startServer() {
  if (!existsSync(".next/BUILD_ID"))
    throw new Error("Build the production app before running test:e2e");
  try {
    await fetch(origin, { signal: AbortSignal.timeout(400) });
    throw new Error("E2E port 3101 is already in use");
  } catch (error) {
    if (error instanceof Error && error.message.includes("already in use"))
      throw error;
  }
  const child = spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(resolve("scripts/e2e/provider-preload.mjs")).href,
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      "3101",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        NODE_OPTIONS: "",
        RAILPLAN_E2E_PROVIDER_STUBS: "controlled-local-only",
        ANTHROPIC_API_KEY: fakeAnthropicKey,
        TELEGRAM_BOT_TOKEN: fakeTelegramToken,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let logs = "";
  const capture = (bytes: Buffer) => {
    logs = (logs + bytes.toString()).slice(-65536);
  };
  child.stdout!.on("data", capture);
  child.stderr!.on("data", capture);
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const timeout = setTimeout(() => child.kill("SIGKILL"), 4000);
    await exited;
    clearTimeout(timeout);
  };
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null)
        throw new Error("E2E production server exited during startup");
      try {
        if (
          (
            await fetch(`${origin}/login`, {
              signal: AbortSignal.timeout(1000),
            })
          ).ok
        )
          return {
            stop,
            counts: () => providerCounts(child),
            logs: () => logs,
          };
      } catch {
        /* Bounded readiness poll; no server output or secrets are printed. */
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error("E2E production server did not become ready");
  } catch (error) {
    await stop();
    throw error;
  }
}
function providerCounts(
  child: ChildProcess,
): Promise<{ anthropic: number; telegram: number; blocked: number }> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timeout = setTimeout(() => {
      child.off("message", listener);
      reject(new Error("E2E provider counter unavailable"));
    }, 2000);
    const listener = (message: unknown) => {
      const value = message as {
        type?: string;
        id?: string;
        counts: { anthropic: number; telegram: number; blocked: number };
      };
      if (value?.type === "e2e-provider-counts" && value.id === id) {
        clearTimeout(timeout);
        child.off("message", listener);
        resolve(value.counts);
      }
    };
    child.on("message", listener);
    child.send({ type: "e2e-provider-counts", id });
  });
}
