import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("post-authentication redirect targets", () => {
  it("keeps an ordinary in-app path", () => {
    expect(safeRedirectPath("/invitations/accept?token=abc", "/app")).toBe("/invitations/accept?token=abc");
    expect(safeRedirectPath("/app/documents", "/app")).toBe("/app/documents");
  });

  it("refuses anything that can leave this origin", () => {
    // `new URL(next, base)` returns ANOTHER origin for each of these, which is what made the auth
    // callback an open redirect: a user who has just signed in is handed to a site they did not choose.
    expect(safeRedirectPath("https://evil.example/steal", "/app")).toBe("/app");
    expect(safeRedirectPath("//evil.example/steal", "/app")).toBe("/app");
    expect(safeRedirectPath("/\\evil.example", "/app")).toBe("/app");
    expect(safeRedirectPath("javascript:alert(1)", "/app")).toBe("/app");
    expect(safeRedirectPath("http://evil.example", "/app")).toBe("/app");
  });

  it("falls back for empty, relative and non-string values", () => {
    expect(safeRedirectPath(undefined, "/app")).toBe("/app");
    expect(safeRedirectPath(null, "/app")).toBe("/app");
    expect(safeRedirectPath("", "/app")).toBe("/app");
    expect(safeRedirectPath("app/documents", "/app")).toBe("/app");
  });

  it("honours the caller's own fallback", () => {
    // The callback lands a brand-new account on onboarding; the login form lands on the app.
    expect(safeRedirectPath("//evil.example", "/onboarding/organization")).toBe("/onboarding/organization");
  });
});
