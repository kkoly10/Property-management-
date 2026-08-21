import { afterEach, describe, expect, it, vi } from "vitest";
import { hasTemplate, renderNotification, resolveLanguage } from "./templates";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveLanguage", () => {
  it("maps every supported locale to a base language with an English fallback", () => {
    expect(resolveLanguage("en-US")).toBe("en");
    expect(resolveLanguage("en-CA")).toBe("en");
    expect(resolveLanguage("es-MX")).toBe("es");
    expect(resolveLanguage("fr-CA")).toBe("fr");
    // An unknown locale must still produce a message rather than dropping it.
    expect(resolveLanguage("de-DE")).toBe("en");
  });
});

describe("hasTemplate", () => {
  it("knows the templates commands actually enqueue", () => {
    for (const code of ["staff_invitation", "resident_invitation", "owner_invitation", "document_delivered", "announcement_published", "conversation_message_received"]) {
      expect(hasTemplate(code)).toBe(true);
    }
  });
  it("rejects an unknown code and inherited Object properties", () => {
    expect(hasTemplate("not_a_template")).toBe(false);
    expect(hasTemplate("constructor")).toBe(false);
    expect(hasTemplate("toString")).toBe(false);
  });
});

describe("renderNotification", () => {
  it("returns null for an unknown template so the worker can dead-letter it", () => {
    expect(renderNotification({ templateCode: "nope", locale: "en-US", payload: {} })).toBeNull();
  });

  it("keeps payload values inert: single line, no markup, bounded", () => {
    const rendered = renderNotification({
      templateCode: "document_delivered",
      locale: "en-US",
      payload: { documentTitle: "<script>alert(1)</script>\nsecond line", organizationName: "Acme" },
    })!;
    expect(rendered.subject).not.toContain("<");
    expect(rendered.subject).not.toContain(">");
    expect(rendered.subject).not.toContain("\n");
  });

  it("uses an absolute secure link when one is supplied", () => {
    const rendered = renderNotification({
      templateCode: "document_delivered",
      locale: "en-US",
      payload: { documentTitle: "Lease", secureLinkUrl: "https://app.example.com/documents/secure/tok", expiresAt: "2026-09-01T00:00:00Z" },
    })!;
    expect(rendered.body).toContain("https://app.example.com/documents/secure/tok");
    expect(rendered.body).toContain("2026-09-01");
  });

  it("REFUSES a relative secure link and falls back to the portal wording", () => {
    // A bare path is a dead link in an email; emitting it would look fine and silently fail.
    const rendered = renderNotification({
      templateCode: "document_delivered",
      locale: "en-US",
      payload: { documentTitle: "Lease", secureLinkUrl: "/documents/secure/tok" },
    })!;
    expect(rendered.body).not.toContain("/documents/secure/tok");
    expect(rendered.body).toContain("/documents");
  });

  it("renders the secure link in each supported language", () => {
    const payload = { documentTitle: "Lease", secureLinkUrl: "https://app.example.com/s/tok" };
    for (const locale of ["en-US", "es-MX", "fr-CA"]) {
      const rendered = renderNotification({ templateCode: "document_delivered", locale, payload })!;
      expect(rendered.subject.length).toBeGreaterThan(0);
      expect(rendered.body).toContain("https://app.example.com/s/tok");
    }
  });

  it("builds portal links from the configured site origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com/");
    const rendered = renderNotification({ templateCode: "staff_invitation", locale: "en-US", payload: { organizationName: "Acme" } })!;
    expect(rendered.body).toContain("https://app.example.com/settings/team/accept");
  });
});
