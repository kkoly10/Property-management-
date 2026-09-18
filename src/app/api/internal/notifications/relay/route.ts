import { NextResponse } from "next/server";
import { carriesCredentialInUrl, matchesSecret } from "@/lib/runtime/worker-auth";
import { senderFor, unsubscribeUrlFor, type MailAudience } from "@/lib/notifications/sender";
import { renderEmailHtml } from "@/lib/notifications/html-email";
import { getResendApiKey, sendViaResend } from "@/lib/notifications/resend";
import type { NotificationDetail, NotificationLanguage } from "@/lib/notifications/templates";

/**
 * Resend adapter for the transactional notification worker.
 *
 * The worker deliberately embeds no mail vendor: it POSTs a rendered message to whatever
 * CRECY_NOTIFICATION_RELAY_URL names and reads back a provider message id. This route is one such
 * relay — it happens to live in the same deployment, which costs no extra infrastructure and keeps the
 * vendor swappable, because the worker still only knows the relay contract.
 *
 * Status mapping is the load-bearing part, and it mirrors `classifyRelayStatus` on the worker side:
 * anything that reflects OUR configuration or a transient upstream must be retryable, because a
 * non-retryable verdict dead-letters the job and there is no command to revive a dead letter. A wrong
 * API key must not destroy the queue while the operator is still fixing the setting.
 */
export const dynamic = "force-dynamic";

type Incoming = {
  notificationJobId: string;
  channel: string;
  to: string;
  locale: string;
  templateCode: string;
  subject: string;
  body: string;
  audience: MailAudience | null;
  /** Where the recipient manages preferences. "none" means they have no such surface. */
  preferenceAudience: MailAudience | "none" | null;
  // Structured presentation fields. All optional: `subject` + `body` alone still produce a complete
  // plain-text email, so a worker that predates them is not a broken deployment.
  preheader: string | null;
  /** The message's prose alone. Absent from an older worker, whose `body` is then parsed instead. */
  paragraphs: string[] | null;
  heading: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  details: NotificationDetail[];
  securityNote: string | null;
  language: NotificationLanguage | null;
};

function badRequest(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "private, no-store" } });
}

/**
 * Bounded the same way as `details` — a relay accepts a message, not an unbounded document.
 *
 * An array that survives nothing comes back as null rather than `[]`, because `[]` would tell the
 * renderer "this message has no prose" and suppress the fallback that keeps an older worker's mail
 * readable. Absent and unusable are the same answer here.
 */
function readParagraphs(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const blocks = value
    .flatMap((p) => (typeof p === "string" && p.trim() ? [p.trim().slice(0, 2000)] : []))
    .slice(0, 12);
  return blocks.length ? blocks : null;
}

function readMessage(value: unknown): Incoming | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
  const optional = (k: string) => (str(k).trim() ? str(k).trim() : null);
  const message = {
    notificationJobId: str("notificationJobId"),
    channel: str("channel"),
    to: str("to"),
    locale: str("locale"),
    templateCode: str("templateCode"),
    subject: str("subject"),
    body: str("body"),
    // Only a known audience is honored. The worker resolves this from the recipient's relationship
    // where the template code cannot express it; anything else falls through to the template mapping
    // rather than letting a caller name an arbitrary brand.
    audience: (["operator", "resident", "owner"] as const).find((a) => a === v.audience) ?? null,
    preferenceAudience: (["operator", "resident", "owner", "none"] as const).find((a) => a === v.preferenceAudience) ?? null,
    preheader: optional("preheader"),
    paragraphs: readParagraphs(v.paragraphs),
    heading: optional("heading"),
    ctaLabel: optional("ctaLabel"),
    // Only an http(s) destination is accepted. A relay is a mail sender, not a place to let an
    // arbitrary scheme through into an href.
    ctaUrl: /^https?:\/\//i.test(str("ctaUrl")) ? str("ctaUrl") : null,
    details: Array.isArray(v.details)
      ? (v.details as unknown[])
        .flatMap((d) => {
          const row = d as Record<string, unknown>;
          return typeof row?.label === "string" && typeof row?.value === "string"
            ? [{ label: row.label.slice(0, 80), value: row.value.slice(0, 200) }]
            : [];
        })
        .slice(0, 8)
      : [],
    securityNote: optional("securityNote"),
    language: (["en", "es", "fr"] as const).find((l) => l === v.language) ?? null,
  };
  if (!message.notificationJobId || !message.to || !message.templateCode || !message.subject || !message.body) return null;
  return message;
}

export async function POST(request: Request) {
  // A credential in the query string is written to every access log along the way, so a request that
  // carries one is refused rather than quietly honored.
  if (carriesCredentialInUrl(request.url)) return badRequest("INVALID_REQUEST", "Credentials must not travel in the URL.", 400);

  const header = request.headers.get("authorization");
  const presented = header ? /^Bearer\s+(.+)$/i.exec(header.trim())?.[1] ?? null : null;
  if (!matchesSecret(presented, process.env.CRECY_NOTIFICATION_RELAY_SECRET)) {
    // 401 is retryable on the worker side on purpose: it usually means the secret is being rotated.
    return badRequest("RELAY_UNAUTHORIZED", "Invalid relay credential.", 401);
  }

  if (!getResendApiKey()) {
    // Retryable on the worker side: the mail vendor is unconfigured, which is our problem and is
    // fixable without rewriting the message. Dead-lettering the queue over it would be wrong.
    return badRequest("MAIL_PROVIDER_NOT_CONFIGURED", "RESEND_API_KEY is not configured.", 503);
  }

  const message = readMessage(await request.json().catch(() => null));
  // 422: this MESSAGE is unsendable. Retrying an identical request cannot fix it, so it dead-letters.
  if (!message) return badRequest("INVALID_MESSAGE", "Missing required message fields.", 422);
  if (message.channel && message.channel !== "email") {
    return badRequest("UNSUPPORTED_CHANNEL", `This relay sends email only, not ${message.channel}.`, 422);
  }

  const sender = senderFor(message.templateCode, message.audience);

  // Keyed on the PREFERENCE SURFACE, not the brand — the two are different questions and were
  // conflated. `unsubscribeUrlFor` already withholds a URL for access mail (unsubscribing from the
  // message that grants you access would lock you out) and for a template whose recipient portal is
  // ambiguous. What it could not know is that a vendor contact's document mail is sent under the
  // neutral Crecy identity while the vendor has no console at all, so the brand said "operator" and the
  // footer offered them a link to a product they cannot sign in to.
  //
  // "none" withholds both the header and the footer link. Anything else falls back to the previous
  // mapping, so a worker that predates this field behaves exactly as it did.
  //
  // The header is the URL form only, not RFC 8058 one-click: that needs a POST endpoint that opts a
  // recipient out with no session, and inventing one would be a way around the sign-in these
  // preferences are scoped by. The link lands on the page and the user opts out there.
  const unsubscribeUrl = message.preferenceAudience === "none"
    ? null
    : unsubscribeUrlFor(message.templateCode, message.preferenceAudience ?? message.audience);
  const headers: Record<string, string> = {};
  if (unsubscribeUrl) headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;

  // The vendor call and its retryable/not-retryable classification live in one module, shared with the
  // Supabase auth email hook. Two copies would drift, and the half that drifted would be the one
  // deciding whether to destroy a queued message.
  const result = await sendViaResend({
    from: sender.from,
    to: message.to,
    subject: message.subject,
    // Multipart: the plain-text body is sent verbatim, and the HTML is the branded rendering of the
    // same message. A client that prefers text is unaffected.
    text: message.body,
    html: renderEmailHtml({
      subject: message.subject,
      body: message.body,
      audience: sender.audience,
      unsubscribeUrl,
      language: message.language ?? undefined,
      preheader: message.preheader,
      paragraphs: message.paragraphs,
      heading: message.heading,
      ctaLabel: message.ctaLabel,
      ctaUrl: message.ctaUrl,
      details: message.details,
      securityNote: message.securityNote,
    }),
    replyTo: sender.replyTo,
    headers,
    tags: [
      { name: "template", value: message.templateCode.slice(0, 60) },
      { name: "audience", value: sender.audience },
    ],
    idempotencyKey: message.notificationJobId,
  });

  if (!result.ok) {
    // The worker reads the STATUS, so the classification has to survive the trip: retryable faults
    // come back 502/503 (which classifyRelayStatus treats as retryable) and a rejected message comes
    // back 422 (which dead-letters).
    return badRequest(result.code, result.detail, result.retryable ? 502 : 422);
  }

  return NextResponse.json({ messageId: result.messageId }, { headers: { "cache-control": "private, no-store" } });
}
