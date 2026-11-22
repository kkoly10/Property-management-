import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_SETTINGS_PATH } from "@/lib/auth/session-settings-path";
import { routeForHost } from "@/lib/runtime/host-routing";
import { getSessionSettings, revokeOtherSessions } from "./session-revocation";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), getClaims: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getSession: auth.getSession, getClaims: auth.getClaims, admin: { signOut: auth.signOut } },
  }),
}));

const sessionId = "10000000-0000-4000-8000-000000000001";
const nextSession = "10000000-0000-4000-8000-000000000002";
const accessToken = "current.synthetic.access-token";
const now = () => Math.floor(Date.now() / 1000);
const recentClaims = () => ({
  session_id: sessionId, role: "authenticated", aal: "aal2", email: "person@example.invalid",
  amr: [{ method: "totp", timestamp: now() - 10 }],
});

function confirmed(allowedSession = sessionId) {
  const form = new FormData();
  form.set("sessionId", allowedSession);
  form.set("confirmation", "revoke");
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { access_token: accessToken } }, error: null });
  auth.getClaims.mockResolvedValue({ data: { claims: recentClaims() }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

describe("account sessions", () => {
  it("shows limited verified session settings on all authenticated portal hosts", async () => {
    expect(await getSessionSettings()).toEqual({
      state: "ready", sessionId, email: "person@example.invalid", verifiedRecently: true,
    });
    for (const host of ["app.crecyos.com", "owner.crecyos.com", "crecyliving.com"]) {
      expect(routeForHost(host, SESSION_SETTINGS_PATH)).toEqual({ type: "continue" });
    }
  });

  it("requires explicit confirmation and binds it to the current verified session", async () => {
    expect(await revokeOtherSessions(new FormData())).toBe("confirmation_required");
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(await revokeOtherSessions(confirmed(nextSession))).toBe("session_changed");
    expect(auth.getClaims).toHaveBeenCalledWith(accessToken);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("blocks missing and unverifiable sessions", async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect(await revokeOtherSessions(confirmed())).toBe("signed_out");
    auth.getClaims.mockResolvedValueOnce({ data: { claims: recentClaims() }, error: { status: 401 } });
    expect(await revokeOtherSessions(confirmed())).toBe("unavailable");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("requires fresh TOTP evidence at AAL2 and rejects a refreshed or future timestamp", async () => {
    for (const claims of [
      { ...recentClaims(), aal: "aal1" },
      { ...recentClaims(), amr: [{ method: "totp", timestamp: now() - 301 }, { method: "token_refresh", timestamp: now() }] },
      { ...recentClaims(), amr: [{ method: "totp", timestamp: now() + 31 }] },
      { ...recentClaims(), amr: ["totp"] },
    ]) {
      auth.getClaims.mockResolvedValueOnce({ data: { claims }, error: null });
      expect(await revokeOtherSessions(confirmed())).toBe("verification_required");
    }
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("uses the verified user token on the provider's explicit others scope and reports rejected requests", async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ msg: "Session invalid" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      }));
    const supabase = createSupabaseClient("https://fixture.supabase.co", "sb_publishable_synthetic", {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: transport },
    });
    auth.signOut.mockImplementation((token, scope) => supabase.auth.admin.signOut(token, scope));
    expect(await revokeOtherSessions(confirmed())).toBe("revoked");
    expect(await revokeOtherSessions(confirmed())).toBe("unavailable");
    expect(auth.signOut).toHaveBeenCalledWith(accessToken, "others");
    const [url, init] = transport.mock.calls[0];
    expect(String(url)).toBe("https://fixture.supabase.co/auth/v1/logout?scope=others");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${accessToken}`);
    expect(new Headers(init?.headers).get("apikey")).toBe("sb_publishable_synthetic");
  });
});
