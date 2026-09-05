import { describe, expect, it } from "vitest";
import { renderEmailHtml } from "./html-email";

const base = {
  subject: "You have been invited to join Northstar on Crecy",
  body: "You have been invited to join Northstar on Crecy as an owner.\n\nAccept the invitation: https://app.crecyos.com/settings/team/accept\n\nIf you were not expecting this, you can ignore this message.",
  audience: "operator" as const,
};

describe("the branded HTML email wrapper", () => {
  it("turns the first link into a button labelled with the sentence that introduced it", () => {
    const html = renderEmailHtml(base);
    expect(html).toContain("https://app.crecyos.com/settings/team/accept");
    // The template author's own action wording becomes the button text.
    expect(html).toContain(">Accept the invitation</a>");
    // The bare URL must not also survive as flowing prose next to the button.
    expect(html).not.toContain("Accept the invitation: https://");
  });

  it("keeps the button where its link was, not after the closing disclaimer", () => {
    // Collecting paragraphs and appending the button at the end put "if you were not expecting this,
    // ignore it" ABOVE the call to action — the dismissal before the thing to do.
    const html = renderEmailHtml(base);
    const button = html.indexOf(">Accept the invitation</a>");
    const disclaimer = html.indexOf("If you were not expecting this");
    expect(button).toBeGreaterThan(-1);
    expect(disclaimer).toBeGreaterThan(-1);
    expect(button).toBeLessThan(disclaimer);
  });

  it("does not repeat the subject as a headline above a body that already says it", () => {
    const html = renderEmailHtml(base);
    // The mail client already shows the subject; restating it as an <h1> directly above a first
    // paragraph that says the same thing read as a duplication bug.
    expect(html).not.toContain("<h1");
  });

  it("still prints the raw URL, because a button cannot be copied or forwarded", () => {
    const html = renderEmailHtml(base);
    expect(html).toContain("Or paste this link into your browser:");
    expect(html.match(/app\.crecyos\.com\/settings\/team\/accept/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("escapes markup from payload-derived text instead of emitting it", () => {
    // templates.ts strips angle brackets, but this layer receives a finished string and must not
    // depend on an invariant maintained somewhere else.
    const html = renderEmailHtml({
      ...base,
      subject: 'Welcome <script>alert("x")</script>',
      body: 'Your home & <b>garden</b>\n\nOpen it: https://crecyliving.com/home',
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>garden</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("renders without a button when the body carries no link", () => {
    const html = renderEmailHtml({ ...base, body: "Your balance was updated.\n\nNothing further is needed." });
    expect(html).not.toContain("Or paste this link into your browser:");
    expect(html).toContain("Your balance was updated.");
    expect(html).toContain("Nothing further is needed.");
  });

  it("falls back to a neutral button label when the lead-in is too long for a button", () => {
    const html = renderEmailHtml({
      ...base,
      audience: "resident",
      body: "Here is a very long introductory sentence that would wrap a button onto several lines: https://crecyliving.com/home",
    });
    expect(html).toContain(">Open Crecy Living</a>");
    // The long lead-in is kept as prose rather than discarded.
    expect(html).toContain("very long introductory sentence");
  });

  it("brands per audience", () => {
    expect(renderEmailHtml({ ...base, audience: "resident" })).toContain(">Crecy Living</span>");
    expect(renderEmailHtml({ ...base, audience: "owner" })).toContain(">Crecy Owner</span>");
    expect(renderEmailHtml({ ...base, audience: "operator" })).toContain(">Crecy</span>");
  });

  it("includes an unsubscribe link only when one is supplied", () => {
    expect(renderEmailHtml(base)).not.toContain("Manage email preferences");
    const withLink = renderEmailHtml({ ...base, unsubscribeUrl: "https://crecyliving.com/more/preferences" });
    expect(withLink).toContain("Manage email preferences");
    expect(withLink).toContain("https://crecyliving.com/more/preferences");
  });

  it("carries preview text so a mail list does not show the brand name on every message", () => {
    const html = renderEmailHtml(base);
    expect(html).toContain("You have been invited to join Northstar");
    expect(html).toContain("display:none");
  });
});
