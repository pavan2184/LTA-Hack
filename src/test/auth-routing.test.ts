// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const { signIn, actor } = vi.hoisted(() => ({ signIn: vi.fn(), actor: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ createAuthClient: async () => ({ auth: { signInWithPassword: signIn } }) }));
vi.mock("@/lib/auth/page", () => ({ workspaceActor: actor }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { login } from "@/app/login/actions";
afterEach(() => vi.clearAllMocks());
const form = (returnTo: string) => {
  const data = new FormData(); data.set("email", "planner@example.test"); data.set("password", "test-password"); data.set("returnTo", returnTo); return data;
};
it("returns an authenticated planner to the requested saved version", async () => {
  signIn.mockResolvedValue({ error: null }); actor.mockResolvedValue({ role: "planner" });
  await expect(login(form("/plans?night=2026-09-16&plan=abc"))).rejects.toThrow("redirect:/plans?night=2026-09-16&plan=abc");
});
it("routes a contractor away from a planner deep link after login", async () => {
  signIn.mockResolvedValue({ error: null }); actor.mockResolvedValue({ role: "contractor" });
  await expect(login(form("/settings/notifications"))).rejects.toThrow("redirect:/contractor");
});
it("preserves a safe destination after invalid credentials without retaining credentials in the URL", async () => {
  signIn.mockResolvedValue({ error: { message: "bad credentials" } });
  await expect(login(form("/requests/drafts?draft=abc"))).rejects.toThrow("redirect:/login?error=credentials&returnTo=%2Frequests%2Fdrafts%3Fdraft%3Dabc");
});
it("uses the role landing page for an external return URL", async () => {
  signIn.mockResolvedValue({ error: null }); actor.mockResolvedValue({ role: "planner" });
  await expect(login(form("//evil.example"))).rejects.toThrow("redirect:/plans");
});
