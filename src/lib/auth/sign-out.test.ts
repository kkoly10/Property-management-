import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  cookieNames: [
    "sb-fixture-auth-token", "sb-fixture-auth-token.0", "sb-fixture-auth-token-code-verifier",
    "sb-fixture-auth-token.another-cooky", "sb-another-auth-token.0", "__Host-crecy-recovery",
  ],
  deleteCookie: vi.fn(),
  setCookie: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => mocks.cookieNames.includes(name) ? { name, value: "fake" } : undefined,
    getAll: () => mocks.cookieNames.map(name => ({ name })),
    delete: mocks.deleteCookie,
    set: mocks.setCookie,
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut: mocks.signOut } }),
}));

import { signOutAction } from "./sign-out";

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe("signOutAction", () => {
  it("ends the local session and clears only Crecy's cookies during provider failure", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "local-publishable-test-key");
    mocks.signOut.mockRejectedValueOnce(new Error("simulated outage"));
    await expect(signOutAction()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.deleteCookie.mock.calls.flat()).toEqual([
      "sb-fixture-auth-token", "sb-fixture-auth-token.0", "sb-fixture-auth-token-code-verifier",
      "crecy_active_organization",
    ]);
    expect(mocks.setCookie).toHaveBeenCalledWith("__Host-crecy-recovery", "", expect.objectContaining({ maxAge: 0, secure: true }));
  });
});
