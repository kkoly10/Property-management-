import { NextResponse } from "next/server";
import { carriesCredentialInUrl } from "@/lib/runtime/worker-auth";
import { verifyStandardWebhook } from "@/lib/notifications/standard-webhooks";
import { AUTH_EMAIL_ACTION_TYPES, VERIFY_OTP_TYPE, isAuthEmailActionType, renderAuthEmail, isSecurityNotification } from "@/lib/notifications/auth-email";
import { renderEmailHtml } from "@/lib/notifications/html-email";
import { resolveLanguage } from "@/lib/notifications/templates";
import { senderFor, type MailAudience } from "@/lib/notifications/sender";
import { sendViaResend, getResendApiKey } from "@/lib/notifications/resend";
import { hostConfig, originForAudience } from "@/lib/runtime/host";

/**
 * The Supabase Send Email Auth Hook.
 *
 * BUILT BUT NOT ENABLED. Pointing Supabase at this endpoint is a deliberate production step that must
 * happen only after the deployed URL has been verified — see the launch runbook. Until then Supabase
 * keeps sending its own default templates, and nothing here runs.
 *
 * ── Security ────────────────────────────────────────────────────────────────────────────────────
 *
 * This endpoint sends mail on behalf of an unauthenticated POST, so the signature is the whole
 * boundary:
 *
 *   * The RAW body is verified before it is parsed. Verifying a re-serialized object checks different
 *     bytes than the ones that were signed.
 *   * A dedicated secret (`SUPABASE_AUTH_HOOK_SECRET`), never the notification relay secret: two
 *     different senders with different blast radii should not share one credential.
 *   * The body is bounded before it is read into memory.
 *   * A credential in the query string is refused outright, because it would be written to every
 *     access log along the way.
 *   * `token` and `token_hash` are never logged and never appear in a response body. The failure
 *     responses below carry a code and nothing else.
 *   * Nothing here calls back into Supabase Auth, so a hook cannot trigger the hook.
 *
 * ── Failing loudly is the correct behaviour ─────────────────────────────────────────────────────
 *
 * Supabase treats a non-2xx as "the email was not sent". Returning 200 when sending failed would make
 * a user's password-reset silently vanish, so every failure path here returns an error status.
 */
export const dynamic = "force-dynamic";

/** Generous for an auth payload, small enough that this cannot be used to push memory around. */
const MAX_BODY_BYTES = 64 * 1024;

function hookError(code: string, httpCode: number) {
  // The shape Supabase documents for a hook failure. No detail: a verification endpoint that explains
  // why it rejected you is a tool for finding out what it accepts.
  return NextResponse.json(
    { error: { http_code: httpCode, message: code } },
    { status: httpCode, headers: { "cache-control": "private, no-store" } },
  );
}

/**
 * Which brand the message comes from, inferred from where Supabase is sending the recipient back to.
 *
 * The auth payload does not say whether this person is an operator, a resident or an owner — Crecy's
 * relationship model lives in the database, not in `auth.users`. `redirect_to` is the one honest
 * signal available, and when it says nothing the neutral operator identity is used rather than a
 * guessed recipient brand.
 */
function audienceForRedirect(redirectTo: string): MailAudience {
  try {
    const host = new URL(redirectTo).host.toLowerCase();
    const { livingRoot } = hostConfig();
    if (livingRoot && (host === livingRoot || host.endsWith(`.${livingRoot}`))) return "resident";
    if (host.startsWith("owner.")) return "owner";
  } catch {
    // An unparseable redirect is not worth a guess.
  }
  return "operator";
}

type EmailData = {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_hash_new?: string;
  token_new?: string;
};

/** One message this hook invocation must send: an address and the token hash that verifies IT. */
type AuthRecipient = { to: string; tokenHash: string; token: string };

/**
 * Who to email, and with which token.
 *
 * Every action type but one is a single message to `user.email` with `token_hash`. `email_change` is
 * the exception, and it is the one place where reading the field names at face value produces a
 * broken flow, so it is spelled out here:
 *
 *   * Supabase fires this hook ONCE for an email change and expects the implementation to send TWO
 *     messages when "Secure email change" is on — one to the address being left, one to the address
 *     being moved to. Sending only one leaves half the change unconfirmable.
 *   * The hash field names are REVERSED for backward compatibility. `token_hash_new` verifies the
 *     CURRENT address and `token_hash` verifies the NEW one — not the other way round. Using
 *     `token_hash` for `user.email`, which is what the names suggest, hands each recipient a token
 *     that only validates the other address.
 *     https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
 *   * With secure email change OFF there is one OTP, for the new address only, and no
 *     `token_hash_new`. Keying the current-address message on `token_hash_new` therefore handles both
 *     configurations without having to ask which one is set: no hash, no message.
 *
 * `token` is only ever displayed (reauthentication), never verified here, so the new address falls
 * back to `token` when `token_new` is absent rather than rendering an empty code.
 */
function recipientsFor(
  actionType: string,
  user: { email: string; newEmail: string },
  data: Partial<EmailData>,
): AuthRecipient[] {
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  if (actionType !== "email_change") {
    return user.email ? [{ to: user.email, tokenHash: str(data.token_hash), token: str(data.token) }] : [];
  }

  const recipients: AuthRecipient[] = [];
  if (user.email && str(data.token_hash_new)) {
    recipients.push({ to: user.email, tokenHash: str(data.token_hash_new), token: str(data.token) });
  }
  if (user.newEmail && str(data.token_hash)) {
    recipients.push({ to: user.newEmail, tokenHash: str(data.token_hash), token: str(data.token_new) || str(data.token) });
  }
  return recipients;
}

export async function POST(request: Request) {
  if (carriesCredentialInUrl(request.url)) return hookError("CREDENTIAL_IN_URL", 400);

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return hookError("PAYLOAD_TOO_LARGE", 413);

  const payload = await request.text().catch(() => "");
  if (!payload || Buffer.byteLength(payload, "utf8") > MAX_BODY_BYTES) return hookError("PAYLOAD_TOO_LARGE", 413);

  // Verify FIRST, parse second.
  const verification = verifyStandardWebhook({
    payload,
    headers: {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    secret: process.env.SUPABASE_AUTH_HOOK_SECRET,
  });
  if (!verification.ok) {
    // An unconfigured secret is OUR fault and must not look like a forged request, so it is a 500:
    // Supabase retries, and the operator sees the endpoint failing rather than silently rejecting.
    return hookError(verification.reason, verification.reason === "NO_SECRET" ? 500 : 401);
  }

  let parsed: { user?: { email?: unknown; new_email?: unknown; user_metadata?: { locale?: unknown } }; email_data?: Partial<EmailData> };
  try {
    parsed = JSON.parse(payload) as typeof parsed;
  } catch {
    return hookError("MALFORMED_PAYLOAD", 400);
  }

  const data = parsed.email_data ?? {};
  const actionType = data.email_action_type;
  if (!isAuthEmailActionType(actionType)) return hookError("UNSUPPORTED_ACTION", 400);

  const recipients = recipientsFor(actionType, {
    email: typeof parsed.user?.email === "string" ? parsed.user.email.trim() : "",
    newEmail: typeof parsed.user?.new_email === "string" ? parsed.user.new_email.trim() : "",
  }, data);
  if (!recipients.length) return hookError("UNSUPPORTED_ACTION", 400);

  const locale = typeof parsed.user?.user_metadata?.locale === "string" ? parsed.user.user_metadata.locale : "en-US";
  const language = resolveLanguage(locale);
  const redirectTo = typeof data.redirect_to === "string" ? data.redirect_to : "";
  const audience = audienceForRedirect(redirectTo);
  const verifyType = VERIFY_OTP_TYPE[actionType];

  if (!getResendApiKey()) return hookError("MAIL_PROVIDER_NOT_CONFIGURED", 500);

  // `senderFor` with an unknown template code falls back to the neutral operator identity, so the
  // audience override is what puts resident auth mail on the Crecy Living From domain.
  const sender = senderFor("auth_email", audience);
  const webhookId = request.headers.get("webhook-id");

  for (const [index, recipient] of recipients.entries()) {
    // The confirmation link points at Crecy's own token-hash endpoint, not at Supabase's. The recipient
    // never sees a Supabase URL, and `next` is carried as a relative path /auth/confirm re-validates.
    let confirmUrl: string | null = null;
    if (verifyType && !isSecurityNotification(actionType) && recipient.tokenHash) {
      const origin = originForAudience(audience) || data.site_url || "";
      if (/^https?:\/\//i.test(origin)) {
        const url = new URL("/auth/confirm", origin);
        url.searchParams.set("token_hash", recipient.tokenHash);
        url.searchParams.set("type", verifyType);
        // Only the PATH of redirect_to survives. Carrying the whole absolute URL would let whatever set
        // it choose the destination, which is the open redirect /auth/confirm exists to prevent.
        try {
          const target = new URL(redirectTo);
          if (target.pathname && target.pathname !== "/") url.searchParams.set("next", `${target.pathname}${target.search}`);
        } catch { /* no usable next */ }
        confirmUrl = url.toString();
      }
    }

    const rendered = renderAuthEmail({ actionType, language, confirmUrl, token: recipient.token || null });

    const result = await sendViaResend({
      from: sender.from,
      to: recipient.to,
      subject: rendered.subject,
      text: rendered.body,
      html: renderEmailHtml({
        subject: rendered.subject,
        body: rendered.body,
        audience: sender.audience,
        language,
        preheader: rendered.preheader,
        paragraphs: rendered.paragraphs,
        heading: rendered.heading,
        ctaLabel: rendered.ctaLabel,
        ctaUrl: rendered.ctaUrl,
        details: rendered.details,
        securityNote: rendered.securityNote,
        // Authentication mail is never unsubscribable: opting out of the message that lets you sign in
        // would lock you out of your own account.
        unsubscribeUrl: null,
      }),
      replyTo: sender.replyTo,
      tags: [{ name: "auth_action", value: actionType }, { name: "audience", value: sender.audience }],
      // NOT the token: an idempotency key is echoed in provider dashboards and logs. The webhook id is
      // the message identity and is safe to expose. It is suffixed per recipient because an email
      // change sends two DIFFERENT messages under one webhook id, and a shared key would make the
      // provider treat the second as a duplicate of the first and drop it.
      idempotencyKey: webhookId ? `${webhookId}-${index}` : null,
    });

    // Supabase retries the whole hook on a non-2xx. The per-recipient idempotency key is what stops
    // that retry from sending an already-delivered message a second time.
    if (!result.ok) return hookError(result.code, result.retryable ? 500 : 422);
  }

  // Supabase takes an empty 200 as "sent".
  return NextResponse.json({}, { headers: { "cache-control": "private, no-store" } });
}

/** Exported for the test that asserts every documented action type is handled. */
export const SUPPORTED_AUTH_ACTIONS = AUTH_EMAIL_ACTION_TYPES;
