import { afterEach, describe, expect, it, vi } from "vitest";
import { secureLinkPath, secureLinkUrl } from "./secure-link";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("secureLinkPath", () => {
  it("encodes the token so it survives a URL boundary", () => {
    expect(secureLinkPath("abc123")).toBe("/documents/secure/abc123");
    expect(secureLinkPath("a/b?c=d")).toBe("/documents/secure/a%2Fb%3Fc%3Dd");
  });
});

describe("secureLinkUrl", () => {
  it("builds an absolute URL from the configured origin, trimming trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com///");
    expect(secureLinkUrl("tok")).toBe("https://app.example.com/documents/secure/tok");
  });

  it("returns null rather than a relative path when no origin is configured", () => {
    // The only consumer is an email body, where a bare path is a dead link.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(secureLinkUrl("tok")).toBeNull();
  });

  it("returns null for a placeholder or non-http origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://replace_me.example.com");
    expect(secureLinkUrl("tok")).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "app.example.com");
    expect(secureLinkUrl("tok")).toBeNull();
  });
});
