import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The token-hash confirmation boundary.
 *
 * This route redeems a credential that arrived in a URL, which makes three things load-bearing: that
 * the redemption is only ever attempted for a value of the right shape and a type from the closed
 * `verifyOtp` set, that the destination afterwards cannot be chosen by whoever built the link, and
 * that the token does not survive into the address bar the recipient is left on.
 *
 * The Supabase client is stubbed, so what is under test is this route's own decision-making rather
 * than GoTrue's.
 */
const verifyOtp = vi.fn(async () => ({ error: null as { message: string } | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp } }),
}));

const { GET } = await import("./route");

/** The route reads `request.nextUrl`, which a plain Request does not carry. */
function confirmRequest(query: string) {
  const url = `https://app.crecyos.com/auth/confirm${query}`;
  return { nextUrl: new URL(url), url } as unknown as Parameters<typeof GET>[0];
}

const GOOD_HASH = "abcdef0123456789abcdef0123456789";

beforeEach(() => {
  verifyOtp.mockReset();
  verifyOtp.mockResolvedValue({ error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("the token-hash confirmation route", () => {
  it("redeems a well-formed link and lands on the requested path", async () => {
    const response = await GET(confirmRequest(`?token_hash=${GOOD_HASH}&type=magiclink&next=%2Fsettings%2Fteam%2Faccept`));
    expect(verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: GOOD_HASH });
    expect(response.headers.get("location")).toBe("https://app.crecyos.com/settings/team/accept");
  });

  it("leaves the token behind when it redirects", async () => {
    // The destination URL is what the browser puts in the address bar, sends as a Referer, and hands
    // to any analytics on the next page. Carrying the incoming query string through would publish a
    // live credential to all three.
    const response = await GET(confirmRequest(`?token_hash=${GOOD_HASH}&type=recovery&next=%2Fhome`));
    const location = response.headers.get("location") ?? "";
    expect(location).not.toContain(GOOD_HASH);
    expect(location).not.toContain("token_hash");
  });

  it("refuses to leave this origin, however the destination is disguised", async () => {
    // `new URL(next, request.url)` does NOT constrain the result to the base origin, so without
    // `safeRedirectPath` each of these lands a just-signed-in user on someone else's site.
    for (const hostile of ["https://evil.example/x", "//evil.example/x", "/\\evil.example"]) {
      const response = await GET(confirmRequest(
        `?token_hash=${GOOD_HASH}&type=magiclink&next=${encodeURIComponent(hostile)}`,
      ));
      const location = response.headers.get("location") ?? "";
      expect(location, hostile).toContain("https://app.crecyos.com/");
      expect(location, hostile).not.toContain("evil.example");
    }
  });

  it("never forwards a type outside the verifyOtp set", async () => {
    for (const type of ["reauthentication", "phone_change", "", "magiclink; drop"]) {
      const response = await GET(confirmRequest(`?token_hash=${GOOD_HASH}&type=${encodeURIComponent(type)}`));
      expect(response.headers.get("location"), type).toContain("/login?auth_error=1");
    }
    expect(verifyOtp, "an unvalidated type reached the auth client").not.toHaveBeenCalled();
  });

  it("never forwards a token hash of the wrong shape", async () => {
    for (const hash of ["short", "a".repeat(513), "has spaces in it 0123456789", "../../etc/passwd0000"]) {
      const response = await GET(confirmRequest(`?token_hash=${encodeURIComponent(hash)}&type=magiclink`));
      expect(response.headers.get("location"), hash).toContain("/login?auth_error=1");
    }
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("gives one answer to every rejection, so the endpoint cannot be probed", async () => {
    // A wrong account, an expired link, a superseded link and a forged one are four different reasons.
    // Distinguishing them tells whoever is probing which half of the credential they got right.
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    const expired = await GET(confirmRequest(`?token_hash=${GOOD_HASH}&type=magiclink&next=%2Fhome`));

    verifyOtp.mockResolvedValue({ error: { message: "User from sub claim in JWT does not exist" } });
    const wrongAccount = await GET(confirmRequest(`?token_hash=${GOOD_HASH}&type=magiclink&next=%2Fhome`));

    const badShape = await GET(confirmRequest("?token_hash=nope&type=magiclink&next=%2Fhome"));

    const destinations = [expired, wrongAccount, badShape].map((r) => r.headers.get("location"));
    expect(new Set(destinations).size, "rejections are distinguishable from each other").toBe(1);
    expect(destinations[0]).toContain("/login?auth_error=1");
  });

  it("does not echo the failure reason to the browser", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    const response = await GET(confirmRequest(`?token_hash=${GOOD_HASH}&type=magiclink`));
    const location = response.headers.get("location") ?? "";
    expect(location).not.toContain("expired");
    expect(location).not.toContain(GOOD_HASH);
  });

  it("lands a link with no destination on the root rather than nowhere", async () => {
    const response = await GET(confirmRequest(`?token_hash=${GOOD_HASH}&type=invite`));
    expect(response.headers.get("location")).toBe("https://app.crecyos.com/");
  });

  it("redeems a replay exactly once, because the second attempt fails upstream", async () => {
    // Single-use is GoTrue's guarantee, not this route's. What this route must not do is treat the
    // second attempt as a success or leak that the first one worked.
    const first = await GET(confirmRequest(`?token_hash=${GOOD_HASH}&type=magiclink&next=%2Fhome`));
    expect(first.headers.get("location")).toBe("https://app.crecyos.com/home");

    verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    const second = await GET(confirmRequest(`?token_hash=${GOOD_HASH}&type=magiclink&next=%2Fhome`));
    expect(second.headers.get("location")).toContain("/login?auth_error=1");
  });
});
