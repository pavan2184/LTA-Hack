// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const backend = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ createAuthClient: async () => ({ auth: { getUser: backend.getUser } }) }));
import { verifyIdentity } from "@/lib/auth/session";
import { authConfig } from "@/lib/auth/config";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
beforeEach(() => backend.getUser.mockReset());
afterEach(() => vi.unstubAllEnvs());
describe("server session verification", () => {
  it("uses the Auth server user ID and ignores all user metadata", async () => {
    backend.getUser.mockResolvedValue({ data: { user: { id: "verified-id", user_metadata: { role: "planner", id: "forged-id" } } }, error: null });
    expect(await verifyIdentity()).toEqual({ id: "verified-id" });
  });
  it("rejects an expired or invalid token even if a user object is present", async () => {
    backend.getUser.mockResolvedValue({ data: { user: { id: "untrusted" } }, error: { message: "invalid token" } });
    await expect(verifyIdentity()).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("rejects missing sessions", async () => {
    backend.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(verifyIdentity()).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("classifies Auth network and service failures as unavailable", async () => {
    for (const error of [new AuthRetryableFetchError("network unavailable", 0), { status: 502 }, { status: 503 }, { status: 504 }]) {
      backend.getUser.mockResolvedValue({ data: { user: null }, error });
      await expect(verifyIdentity()).rejects.toMatchObject({ code: "auth_unavailable" });
    }
  });
  it("rejects anonymous Supabase users", async () => {
    backend.getUser.mockResolvedValue({ data: { user: { id: "anonymous", is_anonymous: true } }, error: null });
    await expect(verifyIdentity()).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("fails closed when public auth configuration is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(authConfig).toThrow("auth_unavailable");
  });
});
