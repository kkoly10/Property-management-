import "server-only";
import type { MailAudience } from "./sender";

/**
 * The branded HTML wrapper around a transactional message.
 *
 * Template bodies stay plain text on purpose — a payload value can never smuggle markup into a
 * recipient's mail client — and templates.ts says the relay "is free to wrap them". This is that wrap:
 * one presentation layer that upgrades every template at once, instead of six hand-authored HTML
 * bodies that would each have to re-solve escaping.
 *
 * Two properties are load-bearing:
 *
 *   * **Everything is escaped here too.** `text()` in templates.ts already strips angle brackets, but
 *     that is the wrong place to rely on: this function receives a finished string and cannot know how
 *     it was built, so it escapes again rather than trusting an invariant maintained elsewhere. An
 *     ampersand in an organization name must not become an entity fragment either.
 *   * **The plain-text body is still sent.** This is the `html` half of a multipart message, never a
 *     replacement — a client that shows text, or a recipient who prefers it, loses nothing.
 *
 * The markup is deliberately old: tables, inline styles, no external images. Mail clients are not
 * browsers; a flexbox layout or a remote logo degrades to a broken box in Outlook or a grey rectangle
 * with images off. A styled wordmark always renders.
 */
const BRAND: Record<MailAudience, { name: string; openLabel: string }> = {
  operator: { name: "Crecy", openLabel: "Open Crecy" },
  resident: { name: "Crecy Living", openLabel: "Open Crecy Living" },
  owner: { name: "Crecy Owner", openLabel: "Open Crecy Owner" },
};

const ACCENT = "#4f46e5";
const INK = "#111827";
const MUTED = "#6b7280";
const HAIRLINE = "#e9ecf2";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Trailing sentence punctuation is not part of the URL. */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/;
function trimUrl(raw: string): string {
  return raw.replace(/[.,;:)\]]+$/, "");
}

export type EmailHtmlInput = {
  subject: string;
  body: string;
  audience: MailAudience;
  unsubscribeUrl?: string | null;
};

/**
 * Render the message as a branded HTML email.
 *
 * The first absolute URL in the body becomes the call-to-action button, and the sentence that
 * introduced it becomes the button's label — "Accept the invitation: <url>" yields a button reading
 * "Accept the invitation", which is exactly the wording the template author already chose. The URL is
 * also printed below the button, because a button is not a link a recipient can copy, forward, or read
 * out to someone on the phone.
 */
export function renderEmailHtml({ subject, body, audience, unsubscribeUrl }: EmailHtmlInput): string {
  const brand = BRAND[audience] ?? BRAND.operator;
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  let ctaUrl: string | null = null;
  let ctaLabel = brand.openLabel;
  const paragraphs: string[] = [];

  for (const block of blocks) {
    const match = ctaUrl ? null : URL_PATTERN.exec(block);
    if (match) {
      ctaUrl = trimUrl(match[0]);
      // The lead-in ("Accept the invitation:") is the author's own action wording. Anything longer than
      // a button can carry falls back to the neutral brand label rather than wrapping to three lines.
      const lead = block.slice(0, match.index).replace(/[\s:：]+$/u, "").trim();
      if (lead && lead.length <= 48) ctaLabel = lead;
      else if (lead) paragraphs.push(lead);
      const tail = block.slice(match.index + match[0].length).trim();
      if (tail) paragraphs.push(tail);
      continue;
    }
    paragraphs.push(block);
  }

  const bodyHtml = paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(p).replaceAll("\n", "<br />")}</p>`)
    .join("");

  const buttonHtml = ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 10px;">
      <tr><td bgcolor="${ACCENT}" style="border-radius:8px;">
        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:13px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(ctaLabel)}</a>
      </td></tr></table>
    <p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:${MUTED};">Or paste this link into your browser:</p>
    <p style="margin:0 0 6px;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(ctaUrl)}" style="color:${ACCENT};text-decoration:underline;">${escapeHtml(ctaUrl)}</a></p>`
    : "";

  const unsubscribeHtml = unsubscribeUrl
    ? `<br /><a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Manage email preferences</a>`
    : "";

  // Hidden preview text: what a mail list shows next to the subject. Without it clients scrape the
  // first visible words, which here would be the brand name on every single message.
  const preheader = escapeHtml((paragraphs[0] ?? subject).slice(0, 140));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f8fb;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f8fb;">
<tr><td align="center" style="padding:26px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${HAIRLINE};border-radius:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="padding:20px 28px;border-bottom:1px solid ${HAIRLINE};">
<span style="font-size:17px;font-weight:700;letter-spacing:-0.01em;color:${INK};">${escapeHtml(brand.name)}</span>
</td></tr>
<tr><td style="padding:28px 28px 24px;">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;font-weight:600;letter-spacing:-0.02em;color:${INK};">${escapeHtml(subject)}</h1>
${bodyHtml}${buttonHtml}
</td></tr>
<tr><td style="padding:16px 28px 20px;border-top:1px solid ${HAIRLINE};font-size:12px;line-height:1.6;color:${MUTED};">
Sent by ${escapeHtml(brand.name)}. If you were not expecting this message you can safely ignore it.${unsubscribeHtml}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
