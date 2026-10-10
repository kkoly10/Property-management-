import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined,
  }),
}));

const {
  applicationAccessCookieName,
  applicationAccessCookieOptions,
  applicationAccessToken,
} = await import("./rental-application-access");

const REF_A = "APP-123456ABCDEF";
const REF_B = "APP-A1B2C3D4E5F6";
const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);

beforeEach(() => jar.clear());

describe("B4 applicant capability cookie isolation", () => {
  it("uses different host-only HttpOnly cookies for different application references", async () => {
    const nameA = applicationAccessCookieName(REF_A);
    const nameB = applicationAccessCookieName(REF_B);
    expect(nameA).toBeTruthy();
    expect(nameB).toBeTruthy();
    expect(nameA).not.toBe(nameB);
    expect(applicationAccessCookieOptions).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    expect(applicationAccessCookieOptions).not.toHaveProperty("domain");
    jar.set(nameA!, TOKEN_A);
    jar.set(nameB!, TOKEN_B);
    expect(await applicationAccessToken(REF_A)).toBe(TOKEN_A);
    expect(await applicationAccessToken(REF_B)).toBe(TOKEN_B);
    jar.delete(nameA!);
    expect(await applicationAccessToken(REF_A)).toBeNull();
    expect(await applicationAccessToken(REF_B)).toBe(TOKEN_B);
  });

  it("rejects guessed, malformed, and noncanonical references without cookie lookup", async () => {
    jar.set(applicationAccessCookieName(REF_A)!, TOKEN_A);
    for (const reference of [
      "", "APP-123456ABCDEF ", "app-123456ABCDEF", "APP-123456ABCDEG",
      "APP-123456ABCDEF/../", "APP-123456ABCDEF;foo=bar", REF_A + REF_B,
    ]) {
      expect(applicationAccessCookieName(reference)).toBeNull();
      expect(await applicationAccessToken(reference)).toBeNull();
    }
    expect(await applicationAccessToken(REF_B)).toBeNull();
  });

  it("never accepts malformed capability values even in the correct cookie", async () => {
    const name = applicationAccessCookieName(REF_A)!;
    for (const value of ["", "A".repeat(64), "1".repeat(63), "1".repeat(65),
      "1".repeat(32) + "; SameSite=None", "not-a-token"]) {
      jar.set(name, value);
      expect(await applicationAccessToken(REF_A)).toBeNull();
    }
  });
});
