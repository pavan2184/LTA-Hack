import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { controlledFetch } from "./provider-policy.mjs";

describe("E2E provider network boundary", () => {
  it("refuses preload activation outside the explicit loopback harness", () => {
    const run = spawnSync(
      process.execPath,
      [
        "--import",
        pathToFileURL(resolve("scripts/e2e/provider-preload.mjs")).href,
        "-e",
        "",
      ],
      {
        env: {
          ...process.env,
          RAILPLAN_E2E_PROVIDER_STUBS: "",
          NODE_OPTIONS: "",
        },
        encoding: "utf8",
        timeout: 3000,
      },
    );
    expect(run.status).not.toBe(0);
    expect(
      run.stderr.includes(
        "E2E preload requires the explicit isolated loopback harness",
      ),
    ).toBe(true);
  });
  it("denies unknown hosts and non-auth Supabase paths without network traffic", async () => {
    const real = vi.fn();
    const { fetch } = controlledFetch(
      real,
      "https://ufcdynfjfzbjvglsdaqp.supabase.co",
    );
    for (const url of [
      "https://example.com",
      "https://ufcdynfjfzbjvglsdaqp.supabase.co/rest/v1/profiles",
      "http://api.telegram.org/x",
      "https://api.anthropic.com.evil.test/v1/messages",
    ])
      await expect(fetch(url)).rejects.toThrow("E2E external request blocked");
    expect(real).not.toHaveBeenCalled();
  });
  it("fakes provider responses while allowing only configured real Supabase authentication", async () => {
    const real = vi.fn().mockResolvedValue(new Response("{}"));
    const { fetch, counts } = controlledFetch(
      real,
      "https://ufcdynfjfzbjvglsdaqp.supabase.co",
    );
    await fetch("https://ufcdynfjfzbjvglsdaqp.supabase.co/auth/v1/user");
    expect(real).toHaveBeenCalledTimes(1);
    const body = JSON.stringify({
      chat_id: "-10012345",
      text: "Controlled message",
    });
    expect(
      (
        await fetch("https://api.telegram.org/bot12345:fake/sendMessage", {
          method: "POST",
          body,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await (
          await fetch("https://api.telegram.org/bot12345:fake/sendMessage", {
            method: "POST",
            body,
          })
        ).json()
      ).result.chat.id,
    ).toBe(-10012345);
    expect(counts.telegram).toBe(2);
    expect(real).toHaveBeenCalledTimes(1);
  });
});
