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

  it("sends each audience to its own origin, derived from the template code", () => {
    // NEXT_PUBLIC_SITE_URL is the OPERATOR origin. Before this split every recipient got it, so a
    // resident invitation and an owner invitation both pointed into Crecy OS.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.crecyos.com");
    vi.stubEnv("NEXT_PUBLIC_MARKETING_ORIGIN", "https://crecyos.com");
    vi.stubEnv("NEXT_PUBLIC_LIVING_ROOT_DOMAIN", "crecyliving.com");
    const render = (templateCode: string) =>
      renderNotification({ templateCode, locale: "en-US", payload: { organizationName: "Acme", title: "T" } })!.body;

    expect(render("staff_invitation")).toContain("https://app.crecyos.com/settings/team/accept");
    expect(render("resident_invitation")).toContain("https://crecyliving.com/invitations/accept");
    expect(render("owner_invitation")).toContain("https://owner.crecyos.com/invitations/accept");
    expect(render("announcement_published")).toContain("https://crecyliving.com/home");

    // No resident or owner mail may point into the operator application.
    expect(render("resident_invitation")).not.toContain("app.crecyos.com");
    expect(render("owner_invitation")).not.toContain("app.crecyos.com");
  });

  it("keeps every audience on one origin in development", () => {
    // Otherwise a dev inbox receives production URLs and Playwright has nothing reachable to click.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    const rendered = renderNotification({ templateCode: "resident_invitation", locale: "en-US", payload: {} })!;
    expect(rendered.body).toContain("http://localhost:3000/invitations/accept");
  });
});

describe("invitation activation links", () => {
  it("carries the activation token so the accept page is reachable", () => {
    // Without it every invitation email linked to a bare /invitations/accept, and the page answered
    // "The invitation link is incomplete." — the invitation was undeliverable by its own email.
    const rendered = renderNotification({
      templateCode: "resident_invitation",
      locale: "en-US",
      payload: { organizationName: "Northstar", invitationToken: "abc-DEF_123" },
    });
    expect(rendered?.body).toContain("/invitations/accept?token=abc-DEF_123");
  });

  it("carries the token for owner and staff invitations too", () => {
    const owner = renderNotification({
      templateCode: "owner_invitation", locale: "en-US", payload: { invitationToken: "tok_owner-1" },
    });
    const staff = renderNotification({
      templateCode: "staff_invitation", locale: "en-US", payload: { roleCode: "org_owner", invitationToken: "tok_staff-1" },
    });
    expect(owner?.body).toContain("/invitations/accept?token=tok_owner-1");
    expect(staff?.body).toContain("/settings/team/accept?token=tok_staff-1");
    // And the role reads as a role, not as a database identifier.
    expect(staff?.body).toContain("an owner");
    expect(staff?.body).not.toContain("org_owner");
  });

  it("falls back to the bare path when no token is present, so older queued jobs still render", () => {
    const rendered = renderNotification({
      templateCode: "resident_invitation", locale: "en-US", payload: { organizationName: "Northstar" },
    });
    expect(rendered?.body).toContain("/invitations/accept");
    expect(rendered?.body).not.toContain("?token=");
  });

  it("refuses a malformed token rather than emitting a broken query string", () => {
    const rendered = renderNotification({
      templateCode: "resident_invitation",
      locale: "en-US",
      payload: { invitationToken: "not a token&injected=1" },
    });
    expect(rendered?.body).not.toContain("?token=");
    expect(rendered?.body).not.toContain("injected");
  });
});
