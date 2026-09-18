import "server-only";
import { EMAIL_CHROME, EMAIL_HTML_LANG, EMAIL_PALETTE, type EmailAudience } from "./email-brand";
import type { NotificationLanguage } from "./templates";

/**
 * The branded HTML half of a transactional message.
 *
 * ── Structured, not reverse-engineered ───────────────────────────────────────────────────────────
 *
 * This used to reconstruct an email from prose: it ran a URL regex over the plain-text body, took the
 * first match as the call to action, and used whatever words happened to precede the colon as the
 * button label. That works until a template puts two links in a paragraph, or writes a lead-in longer
 * than a button, or localizes the punctuation — and then the most important control in the message is
 * decided by a regex. Templates now hand over `heading`, `ctaLabel`, `ctaUrl`, `details` and
 * `securityNote` explicitly, and the prose path survives only as a fallback for a message that
 * supplies none of them, so a queued job from an older build still renders.
 *
 * ── The plain-text part is never replaced ────────────────────────────────────────────────────────
 *
 * This is the `html` half of a multipart message. `body` is still sent verbatim, so a client that
 * shows text, a screen reader, or a recipient who prefers it loses nothing.
 *
 * ── Why the markup is deliberately old ───────────────────────────────────────────────────────────
 *
 * Tables, inline styles, no external fonts, no remote images, no flex and no grid. Mail clients are
 * not browsers: a flex layout collapses in Outlook and a remote logo is a grey box whenever images are
 * off, which for transactional mail is most of the time. A styled wordmark always renders. Everything
 * the recipient needs — who it is from, what it is, what to do — is text.
 *
 * ── Escaping happens here even though templates also escape ──────────────────────────────────────
 *
 * `text()` in templates.ts strips angle brackets already. This function nonetheless escapes
 * everything it receives, because it takes finished strings and cannot know how they were built;
 * relying on an invariant maintained in another module is how injection arrives later. Ampersands are
 * escaped too, so `Smith & Sons` cannot become an entity fragment.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/;
/** Trailing sentence punctuation is not part of the URL. */
function trimUrl(raw: string): string {
  return raw.replace(/[.,;:)\]]+$/, "");
}

export type EmailDetail = { label: string; value: string };

export type EmailHtmlInput = {
  subject: string;
  /** The plain-text part. Also the fallback source when no structured fields are supplied. */
  body: string;
  audience: EmailAudience;
  unsubscribeUrl?: string | null;
  language?: NotificationLanguage;
  preheader?: string | null;
  /**
   * The message's prose, as the template wrote it — NOT parsed back out of `body`.
   *
   * `body` is a full rendering of the whole message: heading, prose, detail lines, the link, the
   * security note. Handing that to the HTML side alongside the structured fields printed the heading,
   * the details and the note twice each — once as prose recovered from the text, once as the element
   * they had been promoted to. Supplying `paragraphs` says "the structure is authoritative", and the
   * prose-recovery path below is then skipped entirely.
   */
  paragraphs?: string[] | null;
  heading?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  details?: EmailDetail[] | null;
  securityNote?: string | null;
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Split the plain-text body around the call to action.
 *
 * The button keeps the POSITION its link held in the text, which is not cosmetic: an invitation ends
 * with "if you were not expecting this, you can ignore it", and collecting every paragraph first and
 * appending the button afterwards puts that dismissal ABOVE the thing the message is asking the
 * recipient to do. Paragraphs that followed the link stay after the button.
 *
 * The block that merely repeats the URL is dropped — in HTML it is already the button and the copyable
 * line beneath it, and printing it a third time reads like a broken template.
 */
function splitAroundCta(
  body: string,
  ctaUrl: string | null,
  ctaLabel: string | null,
): { before: string[]; after: string[] } {
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (!ctaUrl) return { before: blocks, after: [] };

  const index = blocks.findIndex((block) => block.includes(ctaUrl));
  if (index === -1) return { before: blocks, after: [] };

  // The block holding the link usually holds prose too — "Accept the invitation: <url>", or a whole
  // sentence that ends in one. Dropping the entire block to avoid printing the URL twice silently ate
  // that sentence. Strip the URL, keep whatever was around it, and drop the remainder only when it is
  // already the button's own label — otherwise the label would appear as a paragraph AND on the button.
  const remainder = blocks[index].replace(ctaUrl, "").replace(/[\s:：]+$/u, "").trim();
  const keepRemainder = remainder && remainder !== ctaLabel?.trim();
  return {
    before: [...blocks.slice(0, index), ...(keepRemainder ? [remainder] : [])],
    after: blocks.slice(index + 1),
  };
}

export function renderEmailHtml(input: EmailHtmlInput): string {
  const palette = EMAIL_PALETTE[input.audience] ?? EMAIL_PALETTE.operator;
  const language: NotificationLanguage = input.language ?? "en";
  const chrome = EMAIL_CHROME[language] ?? EMAIL_CHROME.en;

  // Fallback path: a message with no structured call to action still gets one, recovered from the
  // first absolute URL in its prose exactly as before.
  let ctaUrl = input.ctaUrl?.trim() || null;
  let ctaLabel = input.ctaLabel?.trim() || null;
  if (!ctaUrl) {
    const match = URL_PATTERN.exec(input.body);
    if (match) {
      ctaUrl = trimUrl(match[0]);
      const lead = input.body.slice(0, match.index).split(/\n{2,}/).pop()?.replace(/[\s:：]+$/u, "").trim() ?? "";
      // A lead-in longer than a button would wrap it onto three lines, so it stays as prose and the
      // button takes the neutral label — localized, like every other string a recipient reads.
      ctaLabel = lead && lead.length <= 48 ? lead : chrome.openBrand.replace("{brand}", palette.name);
    }
  }
  // Only http(s) reaches an href. A template or payload that produced anything else — `javascript:`
  // above all — is dropped rather than rendered as a link.
  if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) { ctaUrl = null; ctaLabel = null; }

  const heading = input.heading?.trim() || input.subject;
  // A structured message states its prose; a legacy one has it recovered from the text part. The two
  // are mutually exclusive on purpose — running the recovery over a body that ALREADY contains the
  // heading, the details and the note is what rendered each of them twice.
  const structuredParagraphs = Array.isArray(input.paragraphs)
    ? input.paragraphs.map((block) => block.trim()).filter(Boolean)
    : null;
  const { before: paragraphs, after: afterCta } = structuredParagraphs
    ? { before: structuredParagraphs, after: [] as string[] }
    : splitAroundCta(input.body, ctaUrl, ctaLabel);
  const details = (input.details ?? []).filter((d) => d.label.trim() && d.value.trim());
  const securityNote = input.securityNote?.trim() || null;
  // What a mail list shows beside the subject. Without it, clients scrape the first visible words —
  // which here would be the brand name on every single message.
  const preheader = (input.preheader?.trim() || paragraphs[0] || input.subject).slice(0, 140);

  const paragraph = (t: string) =>
    `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${palette.ink};">${escapeHtml(t).replaceAll("\n", "<br />")}</p>`;

  // 16px text and 14px vertical padding give a target comfortably over the 44px minimum a thumb needs,
  // and the label is real text so it is still readable with images disabled.
  const ctaHtml = ctaUrl && ctaLabel
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px;">
      <tr><td bgcolor="${palette.action}" style="border-radius:8px;">
        <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(ctaLabel)}</a>
      </td></tr></table>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:${palette.muted};">${escapeHtml(chrome.copyLink)}</p>
    <p style="margin:0 0 18px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(ctaUrl)}" style="color:${palette.action};text-decoration:underline;">${escapeHtml(ctaUrl)}</a></p>`
    : "";

  // Each row states its own label in words. Nothing here is carried by colour or position alone, so
  // the block reads identically to a screen reader and in a client that strips styles.
  const detailsHtml = details.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;background:${palette.soft};border-radius:10px;">
      <tr><td style="padding:14px 16px;">
        ${details.map((d) => `<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:${palette.ink};"><span style="color:${palette.muted};">${escapeHtml(d.label)}:</span> <strong style="font-weight:600;">${escapeHtml(d.value)}</strong></p>`).join("")}
      </td></tr></table>`
    : "";

  const securityHtml = securityNote
    ? `<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:${palette.muted};">${escapeHtml(securityNote)}</p>`
    : "";

  const unsubscribeHtml = input.unsubscribeUrl
    ? `<br /><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${palette.muted};text-decoration:underline;">${escapeHtml(chrome.managePreferences)}</a>`
    : "";

  return `<!doctype html>
<html lang="${EMAIL_HTML_LANG[language] ?? "en"}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${palette.canvas};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${palette.canvas};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${palette.hairline};border-radius:14px;font-family:${FONT};">
<tr><td style="padding:20px 24px;border-bottom:1px solid ${palette.hairline};">
<span style="font-size:17px;font-weight:700;letter-spacing:-0.01em;color:${palette.wordmark};">${escapeHtml(palette.name)}</span>
</td></tr>
<tr><td style="padding:24px 24px 20px;">
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.35;font-weight:700;letter-spacing:-0.01em;color:${palette.ink};">${escapeHtml(heading)}</h1>
${paragraphs.map(paragraph).join("")}
${detailsHtml}
${ctaHtml}
${afterCta.map(paragraph).join("")}
${securityHtml}
</td></tr>
<tr><td style="padding:16px 24px 20px;border-top:1px solid ${palette.hairline};font-size:13px;line-height:1.6;color:${palette.muted};">
${escapeHtml(chrome.sentBy.replace("{brand}", palette.name))}${unsubscribeHtml}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
