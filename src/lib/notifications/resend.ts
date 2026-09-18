import "server-only";

/**
 * The one place Crecy talks to Resend.
 *
 * This was inline in the notification relay route. It is extracted because a second sender now needs
 * it — the Supabase Send Email Auth Hook, which delivers authentication mail that never passes through
 * the notification queue. Two copies of "post to Resend and decide whether the failure is ours" would
 * drift, and the half that drifted would be the one deciding whether to destroy a queued message.
 *
 * ── The classification is the load-bearing part ──────────────────────────────────────────────────
 *
 * "Retryable" means a later identical attempt could succeed, which turns on WHOSE fault the status is.
 * On the notification side a non-retryable verdict dead-letters the job, and there is no command to
 * revive a dead letter — so anything that reflects OUR configuration must stay retryable, or a fix
 * arrives to find the queue already destroyed:
 *
 *   * 429 and 5xx — the provider's own transient state.
 *   * 401 / 403 — our credential, or a sending domain not verified yet: configuration being fixed.
 *   * a 400/422 validation error whose body names the API key or an unverified domain — Resend reports
 *     those same two configuration faults this way too, so match the message, not just the status.
 *
 * Everything else 4xx is Resend rejecting THIS message (bad address, oversized): retrying cannot fix
 * it.
 */
export type ResendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; code: string; detail: string; retryable: boolean };

export type ResendMessage = {
  from: string;
  to: string;
  subject: string;
  /** Always sent. A client that prefers text, or a screen reader, must lose nothing. */
  text: string;
  html: string;
  replyTo?: string | null;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
  /** Resend de-duplicates on this for 24h, which makes a retry safe rather than a double send. */
  idempotencyKey?: string | null;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function getResendApiKey(): string | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey || apiKey.includes("replace_me")) return null;
  return apiKey;
}

export async function sendViaResend(message: ResendMessage): Promise<ResendResult> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    // Retryable: the mail vendor is unconfigured, which is our problem and is fixable without
    // rewriting the message. Dead-lettering a queue over it would be wrong.
    return { ok: false, code: "MAIL_PROVIDER_NOT_CONFIGURED", detail: "RESEND_API_KEY is not configured.", retryable: true };
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.headers && Object.keys(message.headers).length ? { headers: message.headers } : {}),
        ...(message.tags?.length ? { tags: message.tags } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, code: "MAIL_PROVIDER_UNREACHABLE", detail: "Could not reach the mail provider.", retryable: true };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const marker = detail.toLowerCase();
    const configFault = response.status === 401 || response.status === 403
      || /api[ _]?key|not verified|verify a domain|domain is not verified|restricted/.test(marker);
    const retryable = response.status === 429 || response.status >= 500 || configFault;
    return {
      ok: false,
      code: retryable ? "MAIL_PROVIDER_UNAVAILABLE" : "MAIL_PROVIDER_REJECTED",
      detail: `Resend responded ${response.status}. ${detail.slice(0, 300)}`.trim(),
      retryable,
    };
  }

  const receipt = (await response.json().catch(() => null)) as { id?: unknown } | null;
  return { ok: true, messageId: typeof receipt?.id === "string" ? receipt.id : null };
}
