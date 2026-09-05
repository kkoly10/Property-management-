import { NextResponse } from "next/server";
import { carriesCredentialInUrl, matchesSecret } from "@/lib/runtime/worker-auth";
import { senderFor, unsubscribeUrlFor, type MailAudience } from "@/lib/notifications/sender";
import { renderEmailHtml } from "@/lib/notifications/html-email";

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

const RESEND_ENDPOINT = "https://api.resend.com/emails";

type Incoming = {
  notificationJobId: string;
  channel: string;
  to: string;
  locale: string;
  templateCode: string;
  subject: string;
  body: string;
  audience: MailAudience | null;
};

function badRequest(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "cache-control": "private, no-store" } });
}

function readMessage(value: unknown): Incoming | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
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

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey || apiKey.includes("replace_me")) {
    // Retryable: the mail vendor is unconfigured, which is our problem and is fixable without
    // rewriting the message. Dead-lettering the queue over it would be wrong.
    return badRequest("MAIL_PROVIDER_NOT_CONFIGURED", "RESEND_API_KEY is not configured.", 503);
  }

  const message = readMessage(await request.json().catch(() => null));
  // 422: this MESSAGE is unsendable. Retrying an identical request cannot fix it, so it dead-letters.
  if (!message) return badRequest("INVALID_MESSAGE", "Missing required message fields.", 422);
  if (message.channel && message.channel !== "email") {
    return badRequest("UNSUPPORTED_CHANNEL", `This relay sends email only, not ${message.channel}.`, 422);
  }

  const sender = senderFor(message.templateCode, message.audience);

  // List-Unsubscribe is `unsubscribeUrlFor`'s decision entirely, and it is deliberately not this
  // route's to second-guess: it withholds a URL both for access mail (unsubscribing from the message
  // that grants you access would lock you out) and for category mail whose recipient portal is
  // ambiguous (a link to a console the recipient has no account on fails one click later instead of
  // zero, which is not an improvement).
  //
  // The header is the URL form only, not RFC 8058 one-click: that needs a POST endpoint that opts a
  // recipient out with no session, and inventing one would be a way around the sign-in these
  // preferences are scoped by. The link lands on the page and the user opts out there.
  const unsubscribeUrl = unsubscribeUrlFor(message.templateCode, message.audience);
  const headers: Record<string, string> = {};
  if (unsubscribeUrl) headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        // Resend de-duplicates on this for 24h, which makes a worker retry safe rather than a double send.
        "Idempotency-Key": message.notificationJobId.slice(0, 256),
      },
      body: JSON.stringify({
        from: sender.from,
        to: [message.to],
        subject: message.subject,
        // Multipart: the plain-text body is still sent verbatim, and the HTML is the branded wrap of
        // that same text. A client that prefers text is unaffected; one that renders HTML stops
        // showing a wall of unstyled prose with a bare URL in it.
        text: message.body,
        html: renderEmailHtml({
          subject: message.subject,
          body: message.body,
          audience: sender.audience,
          unsubscribeUrl,
        }),
        ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
        ...(Object.keys(headers).length ? { headers } : {}),
        tags: [
          { name: "template", value: message.templateCode.slice(0, 60) },
          { name: "audience", value: sender.audience },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return badRequest("MAIL_PROVIDER_UNREACHABLE", "Could not reach the mail provider.", 502);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Retryable means "a later identical attempt could succeed", which turns on WHOSE fault this is. A
    // dead letter cannot be revived, so anything that reflects OUR configuration must stay retryable, or
    // a fix arrives to find the queue already destroyed:
    //   * 429 / 5xx      — the provider's own transient state.
    //   * 401 / 403      — our credential, or a sending domain not verified yet: config we are fixing.
    //   * a 400/422 validation_error whose body names the API key or an unverified domain — Resend
    //     reports the same two config faults this way too, so match the message, not just the status.
    // Everything else 4xx is Resend rejecting THIS message (bad address, oversized): retrying cannot fix
    // it, so it dead-letters.
    const marker = detail.toLowerCase();
    const configFault = response.status === 401 || response.status === 403
      || /api[ _]?key|not verified|verify a domain|domain is not verified|restricted/.test(marker);
    const retryable = response.status === 429 || response.status >= 500 || configFault;
    return badRequest(
      retryable ? "MAIL_PROVIDER_UNAVAILABLE" : "MAIL_PROVIDER_REJECTED",
      `Resend responded ${response.status}. ${detail.slice(0, 300)}`.trim(),
      retryable ? 502 : 422,
    );
  }

  const receipt = (await response.json().catch(() => null)) as { id?: unknown } | null;
  const messageId = typeof receipt?.id === "string" ? receipt.id : null;
  return NextResponse.json({ messageId }, { headers: { "cache-control": "private, no-store" } });
}
