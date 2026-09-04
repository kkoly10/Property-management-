import { afterEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ key: null as string | null }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, key: string) => {
    captured.key = key;
    return { marker: "admin-client" };
  },
}));

vi.mock("@/lib/supabase/config", () => ({
  requirePublicSupabaseConfig: () => ({ url: "https://project.supabase.co", publishableKey: "sb_publishable_test" }),
}));

const { createAdminClient } = await import("./admin");

afterEach(() => {
  captured.key = null;
  vi.unstubAllEnvs();
});

describe("the server Supabase credential", () => {
  it("falls back to the integration's service-role key when the modern name holds a placeholder", () => {
    // The exact production situation this fallback exists for: SUPABASE_SECRET_KEY was SET but held the
    // replace_me placeholder from .env.example, while the Supabase↔Vercel integration had already
    // provisioned a real SUPABASE_SERVICE_ROLE_KEY. Selecting the first DEFINED value picks the
    // placeholder and throws with a real credential sitting unused in the next variable.
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_replace_me");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJ-real-service-role");
    createAdminClient();
    expect(captured.key).toBe("eyJ-real-service-role");
  });

  it("prefers the modern key when both are real", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_real");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJ-real-service-role");
    createAdminClient();
    expect(captured.key).toBe("sb_secret_real");
  });

  it("treats empty and whitespace-only values as unset", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "   ");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJ-real-service-role");
    createAdminClient();
    expect(captured.key).toBe("eyJ-real-service-role");
  });

  it("still fails loudly when neither is usable, and names both variables", () => {
    // Fail-closed is the point. A worker that quietly constructs a client with a placeholder would
    // authenticate as nobody and produce confusing downstream errors instead of one clear one.
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_replace_me");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => createAdminClient()).toThrow(/SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY/);
    expect(captured.key).toBeNull();
  });
});
