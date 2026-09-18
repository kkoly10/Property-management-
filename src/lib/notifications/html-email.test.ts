import { describe, expect, it } from "vitest";
import { renderEmailHtml } from "./html-email";
import { EMAIL_PALETTE } from "./email-brand";

const proseOnly = {
  subject: "You have been invited to join Northstar on Crecy",
  body: "You have been invited to join Northstar on Crecy as an owner.\n\nAccept the invitation: https://app.crecyos.com/settings/team/accept\n\nIf you were not expecting this, you can ignore this message.",
  audience: "operator" as const,
};

const structured = {
  subject: "Northstar invited you to join their team on Crecy",
  // Exactly what a template hands over: `body` is the finished TEXT part, so it restates the heading,
  // the detail rows, the link and the security note. `paragraphs` is the prose alone.
  body: "You have been invited to Northstar\n\nNorthstar uses Crecy to run its properties.\n\nOrganization: Northstar\nRole: Owner\n\nAccept the invitation: https://app.crecyos.com/settings/team/accept\n\nThis link expires in 72 hours.",
  paragraphs: ["Northstar uses Crecy to run its properties."],
  audience: "operator" as const,
  heading: "You have been invited to Northstar",
  ctaLabel: "Accept the invitation",
  ctaUrl: "https://app.crecyos.com/settings/team/accept",
  details: [{ label: "Organization", value: "Northstar" }, { label: "Role", value: "Owner" }],
  securityNote: "This link expires in 72 hours.",
  language: "en" as const,
};

describe("the branded HTML email wrapper", () => {
  it("renders the structured call to action rather than reconstructing one from prose", () => {
    const html = renderEmailHtml(structured);
    expect(html).toContain(">Accept the invitation</a>");
    expect(html).toContain("https://app.crecyos.com/settings/team/accept");
    // The paragraph that only restated the link is not printed a third time.
    expect(html).not.toContain("Accept the invitation: https://");
  });

  it("renders the heading, the details and the security note exactly once each", () => {
    // Caught by looking at a rendered fixture, not by an assertion: the plain-text `body` is a
    // COMPLETE rendering of the message, so handing it to the HTML side alongside the structured
    // fields printed the heading as an <h1> and again as a paragraph, the detail rows as prose and
    // again as the styled card, and the security note twice. Every assertion still passed, because
    // each one only asked whether the content was present.
    const html = renderEmailHtml(structured);
    const occurrences = (needle: string) => html.split(needle).length - 1;
    expect(occurrences("You have been invited to Northstar"), "heading").toBe(1);
    expect(occurrences("This link expires in 72 hours."), "security note").toBe(1);
    // The detail row survives as the styled card, and not also as a line of prose.
    expect(occurrences("Northstar</strong>"), "detail value").toBe(1);
    expect(html, "detail row printed as prose").not.toContain("Organization: Northstar<");
  });

  it("falls back to reading the body when a message supplies no paragraphs", () => {
    // A job queued before `paragraphs` existed must still render. Without the fallback its prose
    // would vanish entirely, which is a worse failure than the duplication it replaced.
    const html = renderEmailHtml({ ...structured, paragraphs: undefined });
    expect(html).toContain("Northstar uses Crecy to run its properties.");
    expect(html).toContain(">Accept the invitation</a>");
  });

  it("carries a visible heading, not only a <title>", () => {
    // A recipient reading with images off, or a client that hides the subject, still needs the message
    // to say what it is. The <title> element is never rendered in an email body.
    const html = renderEmailHtml(structured);
    expect(html).toContain("<h1");
    expect(html).toContain("You have been invited to Northstar");
  });

  it("keeps the button where its link was, not after the closing disclaimer", () => {
    // Collecting paragraphs and appending the button at the end put "if you were not expecting this,
    // ignore it" ABOVE the call to action — the dismissal before the thing to do.
    const html = renderEmailHtml(proseOnly);
    const button = html.indexOf(">Accept the invitation</a>");
    const disclaimer = html.indexOf("If you were not expecting this");
    expect(button).toBeGreaterThan(-1);
    expect(disclaimer).toBeGreaterThan(-1);
    expect(button).toBeLessThan(disclaimer);
  });

  it("still prints the raw URL, because a button cannot be copied or forwarded", () => {
    const html = renderEmailHtml(structured);
    expect(html).toContain("copy and paste this link into your browser");
    // Twice: once as the button href, once as readable text.
    expect(html.split("https://app.crecyos.com/settings/team/accept").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("falls back to a localized neutral button label when the lead-in is too long", () => {
    const html = renderEmailHtml({
      ...proseOnly,
      body: "This is a very long introductory sentence that could never fit inside a button without wrapping onto several lines: https://app.crecyos.com/x",
    });
    expect(html).toContain(">Open Crecy</a>");
    expect(html).toContain("very long introductory sentence");
  });

  it("escapes every hostile value, including one that arrives already-formed", () => {
    const html = renderEmailHtml({
      ...structured,
      heading: '<script>alert("x")</script>',
      details: [{ label: "Organization", value: `Smith & Sons "Property" <b>Group</b>` }],
      securityNote: "Ends with 'quotes' & ampersands",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Smith &amp; Sons");
    expect(html).toContain("&quot;Property&quot;");
    expect(html).toContain("&#39;quotes&#39;");
  });

  it("refuses a call-to-action scheme that is not http(s)", () => {
    // A payload-supplied destination reaches this function as a finished string. `javascript:` in an
    // href is the one thing an email must never carry.
    const html = renderEmailHtml({ ...structured, ctaUrl: "javascript:alert(1)", body: "No link here." });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("</a>");
  });

  it("survives a very long organization name and a very long URL without breaking the layout", () => {
    const longName = "Northstar Residential Property Management and Associates of the Greater Metropolitan Region".repeat(2);
    const longUrl = `https://app.crecyos.com/settings/team/accept?token=${"a".repeat(400)}`;
    const html = renderEmailHtml({ ...structured, ctaUrl: longUrl, details: [{ label: "Organization", value: longName }] });
    // The copyable URL wraps instead of forcing the 600px card wider than the viewport.
    expect(html).toContain("word-break:break-all");
    expect(html).toContain(longUrl);
    expect(html).toContain(longName.slice(0, 60));
  });

  it("is fluid below the 600px card so it is readable at ~320px", () => {
    const html = renderEmailHtml(structured);
    expect(html).toContain('width:100%;max-width:600px');
    expect(html).toContain('name="viewport"');
    // No layout system a mail client would drop on the floor.
    expect(html).not.toContain("display:flex");
    expect(html).not.toContain("display:grid");
  });

  it("depends on no remote image, external font or script", () => {
    const html = renderEmailHtml(structured);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("fonts.googleapis");
    expect(html).not.toContain("@import");
  });

  it("renders a message with no call to action at all", () => {
    const html = renderEmailHtml({
      subject: "Your password was changed",
      body: "Your Crecy password was changed.",
      audience: "operator",
      heading: "Your password was changed",
    });
    expect(html).toContain("Your password was changed");
    expect(html).not.toContain("copy and paste this link");
  });

  describe("localization", () => {
    it("sets the document language and localizes the chrome, not only the body", () => {
      for (const [language, lang, copy, footer] of [
        ["es", 'lang="es"', "copia y pega este enlace", "Enviado por"],
        ["fr", 'lang="fr"', "copiez ce lien", "Envoyé par"],
      ] as const) {
        const html = renderEmailHtml({ ...structured, language });
        expect(html, `${language}: html lang`).toContain(lang);
        expect(html, `${language}: copy-link line`).toContain(copy);
        expect(html, `${language}: footer`).toContain(footer);
        // The English chrome must not survive alongside the translated chrome.
        expect(html, `${language}: leftover English chrome`).not.toContain("If the button does not work");
      }
    });

    it("localizes the manage-preferences link too", () => {
      const es = renderEmailHtml({ ...structured, language: "es", unsubscribeUrl: "https://app.crecyos.com/settings/notifications" });
      expect(es).toContain("Administrar preferencias");
      expect(es).not.toContain("Manage email preferences");
    });
  });

  describe("audience identity", () => {
    it("uses each surface's own palette from the product brand system", () => {
      for (const audience of ["operator", "resident", "owner"] as const) {
        const html = renderEmailHtml({ ...structured, audience });
        const palette = EMAIL_PALETTE[audience];
        expect(html, `${audience}: wordmark`).toContain(palette.wordmark);
        expect(html, `${audience}: name`).toContain(palette.name);
        expect(html, `${audience}: canvas`).toContain(palette.canvas);
      }
    });

    it("never puts white button text on Crecy Living's identity green", () => {
      // globals.css records why: #01a065 is 3.38:1 against white. It is the wordmark colour, and the
      // darker #067647 is the action colour. Using the identity green for the button would ship a
      // failing contrast ratio to every resident.
      const html = renderEmailHtml({ ...structured, audience: "resident" });
      const buttonStart = html.indexOf("<td bgcolor=");
      const button = html.slice(buttonStart, html.indexOf("</a>", buttonStart));
      expect(button).toContain(EMAIL_PALETTE.resident.action);
      expect(button).not.toContain(EMAIL_PALETTE.resident.wordmark);
    });
  });

  it("hides a preheader that is not meant to be read in the body", () => {
    const html = renderEmailHtml({ ...structured, preheader: "Accept within 72 hours" });
    expect(html).toContain("Accept within 72 hours");
    expect(html).toContain("display:none;max-height:0;overflow:hidden;opacity:0;");
  });
});
