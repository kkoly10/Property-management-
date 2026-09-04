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
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJ-real-service-role");
    createAdminClient();
    expect(captured.key).toBe("eyJ-real-service-role");
  });

  it("prefers the modern key when both are real", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_real");
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJ-real-service-role");
    createAdminClient();
    expect(captured.key).toBe("sb_secret_real");
  });

  it("treats empty and whitespace-only values as unset", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "   ");
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJ-real-service-role");
    createAdminClient();
    expect(captured.key).toBe("eyJ-real-service-role");
  });

  it("still fails loudly when neither is usable, and names both variables", () => {
    // Fail-closed is the point. A worker that quietly constructs a client with a placeholder would
    // authenticate as nobody and produce confusing downstream errors instead of one clear one.
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_replace_me");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    // The message must name the project it needed a credential FOR, so a wrong-project
    // configuration is diagnosable from the error alone.
    expect(() => createAdminClient()).toThrow(/No server Supabase credential is configured for project\.supabase\.co/);
    expect(() => createAdminClient()).toThrow(/SUPABASE_SECRET_KEY/);
    expect(captured.key).toBeNull();
  });
});

describe("the integration credential is refused when it belongs to another project", () => {
  it("ignores SUPABASE_SERVICE_ROLE_KEY when SUPABASE_URL names a different project", () => {
    // The real production defect: the Supabase↔Vercel integration was bound to a different, paused
    // project, so this key was valid — for the wrong database. Accepting it produced authenticated
    // requests that failed inside every RPC, which is a worse failure than having no credential.
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_replace_me");
    vi.stubEnv("SUPABASE_URL", "https://some-other-project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJ-key-for-the-wrong-project");
    expect(() => createAdminClient()).toThrow(/project\.supabase\.co/);
    expect(captured.key).toBeNull();
  });

  it("ignores it when the integration declares no project at all", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_replace_me");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJ-orphan-key");
    expect(() => createAdminClient()).toThrow();
    expect(captured.key).toBeNull();
  });
});
