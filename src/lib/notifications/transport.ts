import "server-only";
import type { RenderedNotification } from "./templates";

/**
 * Outbound transport for transactional notifications.
 *
 * Crecy does not embed a mail vendor. The operator points CRECY_NOTIFICATION_RELAY_URL at their own
 * sending service; the worker POSTs a rendered message and reads back a provider message id. Nothing
 * here invents a provider identifier — `providerCode` is the neutral "relay", and the real vendor id
 * (if any) is whatever the relay returns. With no relay configured the worker reports "not configured"
 * rather than pretending a message was delivered.
 */
export type TransportSuccess = { ok: true; providerCode: string; providerMessageId: string | null };
export type TransportFailure = { ok: false; errorCode: string; retryable: boolean };
export type TransportResult = TransportSuccess | TransportFailure;

export type OutboundMessage = {
  notificationJobId: string;
  channel: string;
  to: string;
  locale: string;
  templateCode: string;
  rendered: RenderedNotification;
};

export type NotificationTransport = {
  readonly providerCode: string;
  send(message: OutboundMessage): Promise<TransportResult>;
};

export function getNotificationRelayConfig(): { url: string; secret: string } | null {
  const url = process.env.CRECY_NOTIFICATION_RELAY_URL;
  const secret = process.env.CRECY_NOTIFICATION_RELAY_SECRET;
  if (!url || url.includes("replace_") || !/^https:\/\//i.test(url)) return null;
  if (!secret || secret.includes("replace_") || secret.length < 16) return null;
  return { url, secret };
}

/**
 * Retryable means "a later identical attempt could succeed", which turns on WHOSE fault the status is.
 *
 * The distinction matters more than it looks: a non-retryable verdict dead-letters the job, and there
 * is no command to revive a dead letter. So a status that actually reflects OUR configuration must
 * never be non-retryable — otherwise one wrong relay secret (401) or one stale relay URL (404) would
 * permanently destroy every message in the queue while the operator was still fixing the setting.
 *
 *   * 401 / 403 / 404 / 407 / 408 / 429 and every 5xx — our credential, our endpoint, or the relay's
 *     own state. Retry behind the backoff; they resolve when the operator or the relay recovers.
 *   * every other 4xx (400, 413, 422, ...) — the relay is rejecting THIS message: bad address,
 *     oversized payload, unknown template. Retrying an identical request cannot fix it.
 */
export function classifyRelayStatus(status: number): TransportFailure {
  const configurationOrTransient = status === 401 || status === 403 || status === 404
    || status === 407 || status === 408 || status === 429 || status >= 500;
  return { ok: false, errorCode: `RELAY_HTTP_${status}`, retryable: configurationOrTransient };
}

export function getNotificationTransport(): NotificationTransport | null {
  const config = getNotificationRelayConfig();
  if (!config) return null;
  return {
    providerCode: "relay",
    async send(message: OutboundMessage): Promise<TransportResult> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(config.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${config.secret}`,
            "idempotency-key": message.notificationJobId,
          },
          body: JSON.stringify({
            notificationJobId: message.notificationJobId,
            channel: message.channel,
            to: message.to,
            locale: message.locale,
            templateCode: message.templateCode,
            subject: message.rendered.subject,
            body: message.rendered.body,
          }),
          signal: controller.signal,
        });
        if (!response.ok) return classifyRelayStatus(response.status);
        const receipt = (await response.json().catch(() => null)) as { messageId?: unknown } | null;
        const messageId = typeof receipt?.messageId === "string" ? receipt.messageId.slice(0, 200) : null;
        return { ok: true, providerCode: "relay", providerMessageId: messageId };
      } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        return { ok: false, errorCode: aborted ? "RELAY_TIMEOUT" : "RELAY_UNREACHABLE", retryable: true };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
