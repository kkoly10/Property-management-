import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ value: null as { url: string; publishableKey: string } | null }));
const created = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/lib/supabase/config", () => ({
  getPublicSupabaseConfig: () => config.value,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    created.count += 1;
    // A stub that reports a signed-in user, so the redirect path is exercised only by the prefix rule.
    return { auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) } };
  },
}));

const { updateSession } = await import("./proxy");

function request(path: string) {
  return new NextRequest(new URL(path, "https://app.crecyos.com"));
}

afterEach(() => {
  created.count = 0;
});

describe("the session proxy, with Supabase configured", () => {
  config.value = { url: "https://project.supabase.co", publishableKey: "sb_publishable_test" };

  it("never creates a session client for a public page", async () => {
    // This is the load-bearing ordering. createServerClient can rotate the session and write
    // Set-Cookie onto the response; a marketing page is shared-cacheable, so a cached response
    // carrying that header would hand one visitor's session to the next. The page needs no session,
    // so it must not reach the client at all — not merely avoid caching afterwards.
    for (const path of ["/", "/product", "/pricing", "/crecy-living", "/security", "/pilot", "/legal", "/legal/operator-terms"]) {
      const response = await updateSession(request(path));
      expect(created.count, `${path} constructed a session client`).toBe(0);
      expect(response.headers.get("set-cookie"), `${path} carries a cookie`).toBeNull();
      expect(response.headers.get("cache-control"), `${path} is marked uncacheable`).toBeNull();
    }
  });

  it("still creates one for every page that is not public", async () => {
    for (const path of ["/app", "/home", "/login", "/signup", "/invitations/accept", "/api/v1/payments"]) {
      created.count = 0;
      const response = await updateSession(request(path));
      expect(created.count, `${path} skipped the session client`).toBe(1);
      expect(response.headers.get("cache-control"), `${path} is shared-cacheable`).toBe("private, no-store");
    }
  });

  it("sends an unauthenticated visitor to login with a return path, and only for gated routes", async () => {
    const anonymous = { auth: { getUser: async () => ({ data: { user: null }, error: null }) } };
    vi.doMock("@supabase/ssr", () => ({ createServerClient: () => anonymous }));
    vi.resetModules();
    const { updateSession: gated } = await import("./proxy");

    const blocked = await gated(request("/app/properties"));
    expect(blocked.status).toBe(307);
    const location = new URL(blocked.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/app/properties");

    // The way in must stay open, or nobody can ever authenticate.
    for (const path of ["/login", "/signup", "/invitations/accept", "/documents/secure/token-abc"]) {
      const open = await gated(request(path));
      expect(open.status, `${path} redirected an anonymous visitor`).toBe(200);
    }
    vi.doUnmock("@supabase/ssr");
    vi.resetModules();
  });
});
