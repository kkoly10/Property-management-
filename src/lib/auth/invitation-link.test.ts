import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateInvitationAuthToken, isPlausibleTokenHash } from "./invitation-link";

/**
 * What an invitation's credential is, and — the part that was wrong — what it is NOT.
 *
 * `generateLink` returns both an `action_link` and a `hashed_token`. Taking the action link looks
 * right and fails completely: it is a Supabase-hosted `/auth/v1/verify` redirect, and because an
 * admin-generated link carries no PKCE code_verifier, GoTrue completes it in the IMPLICIT flow —
 * the session comes back as a URL fragment (`#access_token=…`), never as `?code=`. A browser never
 * sends a fragment to a server, so Crecy's `/auth/callback`, which reads `?code=` and calls
 * `exchangeCodeForSession`, would have found nothing and sent every invited person to
 * `/signup?auth_error=1`.
 *
 * These tests pin the choice so it cannot be quietly undone.
 */
function adminReturning(properties: Record<string, unknown> | null, error: unknown = null) {
  // The argument is typed, not named: the tests assert on `mock.calls`, and an unused binding would be
  // a lint warning for no benefit.
  const generateLink = vi.fn((args: Record<string, unknown>) => {
    void args;
    return Promise.resolve({ data: properties ? { properties } : null, error });
  });
  return { client: { auth: { admin: { generateLink } } } as unknown as SupabaseClient, generateLink };
}

const HASH = "abcdef0123456789abcdef0123456789";
const ACTION_LINK = `https://project.supabase.co/auth/v1/verify?token=${HASH}&type=magiclink&redirect_to=https%3A%2F%2Fapp.crecyos.com`;

describe("the invitation auth credential", () => {
  it("takes the token hash and discards the action link", async () => {
    const { client } = adminReturning({ action_link: ACTION_LINK, hashed_token: HASH, verification_type: "magiclink" });
    const result = await generateInvitationAuthToken(client, { email: "person@example.com" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokenHash).toBe(HASH);
    // The returned value is a bare credential, not a URL — nothing downstream can treat it as one.
    expect(result).not.toHaveProperty("actionUrl");
    expect(JSON.stringify(result)).not.toContain("/auth/v1/verify");
  });

  it("asks for a magiclink and does not ask GoTrue to choose a redirect", async () => {
    // `invite` is version-unstable for an address that already exists (supabase/supabase#22562), and
    // both routes create the auth user first, so `magiclink` is the stable path.
    //
    // No `redirectTo`: it is only ever baked into the action link we are discarding. Dropping it also
    // drops a silent failure mode — GoTrue validates `redirect_to` against the project allow-list and
    // substitutes the Site URL on a miss, with no error anywhere.
    const { client, generateLink } = adminReturning({ hashed_token: HASH });
    await generateInvitationAuthToken(client, { email: "person@example.com" });

    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "person@example.com" });
    expect(generateLink.mock.calls[0][0]).not.toHaveProperty("options");
  });

  it("refuses a hash that could not be redeemed", async () => {
    // The same shape `/auth/confirm` enforces. A value that cannot possibly verify is refused where it
    // is minted rather than stored, mailed, and failed at by the recipient.
    for (const hashed_token of ["short", "a".repeat(513), "has spaces in it 012345", "../../etc/passwd000", ""]) {
      const { client } = adminReturning({ hashed_token });
      const result = await generateInvitationAuthToken(client, { email: "person@example.com" });
      expect(result.ok, hashed_token.slice(0, 20)).toBe(false);
    }
  });

  it("reports a fixed code and never echoes GoTrue's failure", async () => {
    // A GoTrue error body can carry the address and, on some paths, link material. It must not reach a
    // response or a log line.
    const { client } = adminReturning(null, { message: "User person@example.com not found", status: 404 });
    const result = await generateInvitationAuthToken(client, { email: "person@example.com" });

    expect(result).toEqual({ ok: false, code: "AUTH_LINK_UNAVAILABLE" });
    expect(JSON.stringify(result)).not.toContain("person@example.com");
  });

  it("treats a response with no hashed_token as unavailable rather than proceeding", async () => {
    // The action link alone is not a usable credential for a server-side redemption, so a response
    // carrying only that is a failure, not a fallback.
    const { client } = adminReturning({ action_link: ACTION_LINK });
    expect(await generateInvitationAuthToken(client, { email: "person@example.com" })).toEqual({
      ok: false,
      code: "AUTH_LINK_UNAVAILABLE",
    });
  });

  it("agrees with the confirm endpoint about what a token hash looks like", () => {
    expect(isPlausibleTokenHash(HASH)).toBe(true);
    expect(isPlausibleTokenHash("a".repeat(16))).toBe(true);
    expect(isPlausibleTokenHash("a".repeat(15))).toBe(false);
    expect(isPlausibleTokenHash("a".repeat(513))).toBe(false);
    expect(isPlausibleTokenHash("with.a.dot0123456789")).toBe(false);
    expect(isPlausibleTokenHash(null)).toBe(false);
  });
});
