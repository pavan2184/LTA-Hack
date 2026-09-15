import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(href); } }));
import { redirectSandboxSection } from "@/lib/navigation/sandbox-redirect";

it.each(["requests", "conflicts", "schedule", "resources", "scenarios"] as const)(
  "redirects the old %s page to the single dashboard without losing return context",
  async section => {
    await expect(redirectSandboxSection(section, Promise.resolve({
      night: "2026-09-16", plan: "saved-version", request: "M-008",
      returnTo: "https://example.com", note: "private", duplicate: ["a", "b"],
    }))).rejects.toThrow(
      "/sandbox?night=2026-09-16&plan=saved-version&request=M-008#sandbox-" + section,
    );
  },
);
