import { afterEach, describe, expect, it, vi } from "vitest";
import { TEMPLATE_CODES, hasTemplate, renderNotification, resolveLanguage } from "./templates";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The production-shaped origins. Without them every absolute link collapses to a bare path. */
function stubOrigins() {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.crecyos.com");
  vi.stubEnv("NEXT_PUBLIC_MARKETING_ORIGIN", "https://crecyos.com");
  vi.stubEnv("NEXT_PUBLIC_LIVING_ROOT_DOMAIN", "crecyliving.com");
}

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

  it("REFUSES a relative secure link and falls back to the recipient's own portal", () => {
    // A bare path is a dead link in an email; emitting it would look fine and silently fail.
    stubOrigins();
    const rendered = renderNotification({
      templateCode: "document_delivered",
      locale: "en-US",
      payload: { documentTitle: "Lease", secureLinkUrl: "/documents/secure/tok" },
      audience: "resident",
    })!;
    expect(rendered.body).not.toContain("/documents/secure/tok");
    expect(rendered.ctaUrl).toBe("https://crecyliving.com/documents");
  });

  it("sends each document recipient to the portal THEY can open", () => {
    stubOrigins();
    // This template reaches residents, owners and vendor contacts under one code, and it used to send
    // all three to `link("/documents", "operator")` — the RESIDENT path on the OPERATOR origin, a page
    // that exists for nobody who receives this message. An owner landed on a resident route of a
    // console they have no account on.
    const payload = { documentTitle: "Lease renewal" };
    const resident = renderNotification({ templateCode: "document_delivered", locale: "en-US", payload, audience: "resident" })!;
    const owner = renderNotification({ templateCode: "document_delivered", locale: "en-US", payload, audience: "owner" })!;

    expect(resident.ctaUrl, "resident").toBe("https://crecyliving.com/documents");
    expect(owner.ctaUrl, "owner").toBe("https://owner.crecyos.com/owner/documents");
    expect(owner.ctaUrl, "owner sent to the resident path").not.toContain("crecyliving.com");
  });

  it("offers no button to a recipient with no portal", () => {
    stubOrigins();
    // A vendor contact has no Crecy surface (FD-037), and an unresolved audience is not a guess worth
    // making. A link that fails one click later is not an improvement on failing zero clicks later.
    for (const audience of [null, "operator"] as const) {
      const rendered = renderNotification({
        templateCode: "document_delivered",
        locale: "en-US",
        payload: { documentTitle: "Lease renewal" },
        audience,
      })!;
      expect(rendered.ctaUrl, `${audience}`).toBeUndefined();
      expect(rendered.body, `${audience}`).not.toContain("/documents");
      // And the COPY must not imply one either. "Confirm you have read them" describes an action in a
      // portal, which is a product a vendor contact cannot open.
      expect(rendered.body, `${audience}: copy implies a portal`).not.toContain("confirm you have read");
      expect(rendered.body, `${audience}`).toContain("can send you a copy or a secure link");
    }
  });

  it("keeps the portal wording for a recipient who has one", () => {
    stubOrigins();
    for (const audience of ["resident", "owner"] as const) {
      const rendered = renderNotification({
        templateCode: "document_delivered",
        locale: "en-US",
        payload: { documentTitle: "Lease renewal" },
        audience,
      })!;
      expect(rendered.body, audience).toContain("confirm you have read");
    }
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
    // And the role reads as a role, not as a database identifier. It is now a labelled detail row
    // rather than a clause, so the assertion is on the row rather than on the sentence wording.
    expect(staff?.details).toContainEqual({ label: "Role", value: "Owner" });
    expect(staff?.body).toContain("Role: Owner");
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

/**
 * The template matrix.
 *
 * Every template, in every language, with the properties that make a transactional message safe to
 * send: it names the sender, it has exactly one thing to do, it says what happens if you ignore it,
 * and it does not promise a capability the pilot has not switched on.
 */
describe("the transactional template matrix", () => {
  const LANGUAGES = [["en", "en-US"], ["es", "es-MX"], ["fr", "fr-CA"]] as const;
  const INVITATIONS = ["staff_invitation", "resident_invitation", "owner_invitation"] as const;

  const payloadFor = (templateCode: string) => ({
    organizationName: "Northstar Property Group",
    roleCode: "property_manager",
    expiresAt: "2026-09-21T10:00:00Z",
    mfaRequired: false,
    documentTitle: "Lease renewal",
    title: "Water shutoff on Tuesday",
    invitationToken: "tok-abc_123",
    ...(templateCode === "staff_invitation" ? {} : {}),
  });

  it("renders every template in every language with a subject, a body and a heading", () => {
    for (const templateCode of TEMPLATE_CODES) {
      for (const [language, locale] of LANGUAGES) {
        const rendered = renderNotification({ templateCode, locale, payload: payloadFor(templateCode) });
        expect(rendered, `${templateCode}/${language}`).not.toBeNull();
        expect(rendered!.subject.length, `${templateCode}/${language}: subject`).toBeGreaterThan(8);
        expect(rendered!.body.length, `${templateCode}/${language}: body`).toBeGreaterThan(40);
        expect(rendered!.heading, `${templateCode}/${language}: heading`).toBeTruthy();
        expect(rendered!.language, `${templateCode}/${language}: language`).toBe(language);
        // The plain-text part is composed from the structured fields, so it must carry the link.
        if (rendered!.ctaUrl) {
          expect(rendered!.body, `${templateCode}/${language}: text part lost the link`).toContain(rendered!.ctaUrl);
        }
      }
    }
  });

  it("names the inviting organization in every invitation, in every language", () => {
    for (const templateCode of INVITATIONS) {
      for (const [language, locale] of LANGUAGES) {
        const rendered = renderNotification({ templateCode, locale, payload: payloadFor(templateCode) });
        expect(rendered!.body, `${templateCode}/${language}`).toContain("Northstar Property Group");
        expect(rendered!.details, `${templateCode}/${language}: organization row`)
          .toContainEqual(expect.objectContaining({ value: "Northstar Property Group" }));
      }
    }
  });

  it("states the 72-hour expiry and what to do if the invitation was unexpected", () => {
    const expectations = {
      en: ["72 hours", "not expecting"],
      es: ["72 horas", "no esperabas"],
      fr: ["72 heures", "n'attendiez pas"],
    } as const;
    for (const templateCode of INVITATIONS) {
      for (const [language, locale] of LANGUAGES) {
        const rendered = renderNotification({ templateCode, locale, payload: payloadFor(templateCode) });
        for (const phrase of expectations[language]) {
          expect(rendered!.securityNote ?? "", `${templateCode}/${language}: ${phrase}`).toContain(phrase);
        }
      }
    }
  });

  it("never leaks a raw role code, in any language, even for an unknown role", () => {
    for (const roleCode of ["org_owner", "maintenance_coordinator", "read_only_auditor", "some_future_role"]) {
      for (const [language, locale] of LANGUAGES) {
        const rendered = renderNotification({ templateCode: "staff_invitation", locale, payload: { ...payloadFor("staff_invitation"), roleCode } });
        expect(rendered!.body, `${roleCode}/${language}`).not.toContain(roleCode);
        expect(rendered!.body, `${roleCode}/${language}: underscore identifier`).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
      }
    }
  });

  it("promises no capability the pilot has not switched on", () => {
    // Online payment is not activated for the pilot, and no uploaded file is inspected for malware.
    // An invitation that opens onto a missing feature is a broken promise on the first visit.
    const forbidden = [
      /\bpay (?:your )?rent\b/i, /\bmake a payment\b/i, /\bmake payments\b/i, /\bpagar\b/i, /\bpayer\b/i,
      /\bscan(?:ned|ning)?\b/i, /\bmalware\b/i, /\bvirus\b/i,
    ];
    for (const templateCode of TEMPLATE_CODES) {
      for (const [language, locale] of LANGUAGES) {
        const rendered = renderNotification({ templateCode, locale, payload: payloadFor(templateCode) });
        for (const pattern of forbidden) {
          expect(rendered!.body, `${templateCode}/${language} matched ${pattern}`).not.toMatch(pattern);
        }
      }
    }
  });

  it("builds the sign-in link itself, from a token hash, on a Crecy origin", () => {
    stubOrigins();
    // One click both signs the recipient in and accepts the invitation. The credential in the payload
    // is an OPAQUE HASH, never a URL: a URL supplied by a caller is a URL this worker would then send
    // under Crecy's From domain and branding, which is a phishing primitive in our own envelope. The
    // destination is assembled here from an origin only this deployment supplies.
    const hash = "abcdef0123456789abcdef0123456789";
    for (const templateCode of INVITATIONS) {
      const rendered = renderNotification({ templateCode, locale: "en-US", payload: { ...payloadFor(templateCode), authTokenHash: hash } })!;
      const url = new URL(rendered.ctaUrl!);

      expect(url.pathname, templateCode).toBe("/auth/confirm");
      expect(url.searchParams.get("token_hash"), templateCode).toBe(hash);
      expect(url.searchParams.get("type"), templateCode).toBe("magiclink");
      // `next` stays RELATIVE: /auth/confirm re-validates it and builds the final redirect from its
      // own origin, so nothing in a payload can steer a just-signed-in user off-site.
      expect(url.searchParams.get("next"), templateCode).toMatch(/^\/[^/]/);
      expect(url.searchParams.get("next"), templateCode).toContain("token=tok-abc_123");

      const withoutHash = renderNotification({ templateCode, locale: "en-US", payload: payloadFor(templateCode) });
      expect(withoutHash!.ctaUrl, `${templateCode}: fallback`).toContain("token=tok-abc_123");
      expect(withoutHash!.ctaUrl, `${templateCode}: fallback`).not.toContain("/auth/confirm");
    }
  });

  it("cannot be made to point an invitation anywhere but Crecy", () => {
    stubOrigins();
    // The whole point of carrying a hash rather than a URL. Anything that is not a plausible token
    // hash is simply not a credential, and the message falls back to the bare acceptance link — it
    // never becomes a destination.
    for (const hostile of [
      "https://evil.example/steal",
      "javascript:alert(1)",
      "//evil.example",
      "abc",
      "has spaces 0123456789abcdef",
    ]) {
      const rendered = renderNotification({
        templateCode: "staff_invitation",
        locale: "en-US",
        payload: { ...payloadFor("staff_invitation"), authTokenHash: hostile },
      })!;
      expect(rendered.ctaUrl, hostile).toContain("/settings/team/accept");
      expect(rendered.ctaUrl, hostile).not.toContain("evil.example");
      expect(rendered.ctaUrl, hostile).not.toContain("javascript:");
    }
  });

  it("ignores an auth action URL, which is no longer a thing a payload can carry", () => {
    // The previous design put `properties.action_link` here. It is now inert: only `authTokenHash` is
    // read, so a stale job carrying the old key renders the fallback rather than an unusable link.
    const rendered = renderNotification({
      templateCode: "staff_invitation",
      locale: "en-US",
      payload: { ...payloadFor("staff_invitation"), authActionUrl: "https://project.supabase.co/auth/v1/verify?token=x" },
    });
    expect(rendered!.ctaUrl).not.toContain("/auth/v1/verify");
    expect(rendered!.ctaUrl).toContain("/settings/team/accept");
  });

  it("mentions two-factor only when the role actually requires it", () => {
    const required = renderNotification({ templateCode: "staff_invitation", locale: "en-US", payload: { ...payloadFor("staff_invitation"), mfaRequired: true } });
    const not = renderNotification({ templateCode: "staff_invitation", locale: "en-US", payload: { ...payloadFor("staff_invitation"), mfaRequired: false } });
    expect(required!.body).toContain("two-factor");
    expect(not!.body).not.toContain("two-factor");
  });
});
