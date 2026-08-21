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
 * A 4xx is the relay telling us the request itself is wrong (bad address, unknown template) — retrying
 * an identical request cannot fix that, so it dead-letters. 408/429 and 5xx are transient by
 * definition, as is any network error, so those go back on the queue behind the backoff.
 */
function classifyStatus(status: number): TransportFailure {
  if (status === 408 || status === 429) return { ok: false, errorCode: `RELAY_HTTP_${status}`, retryable: true };
  if (status >= 400 && status < 500) return { ok: false, errorCode: `RELAY_HTTP_${status}`, retryable: false };
  return { ok: false, errorCode: `RELAY_HTTP_${status}`, retryable: true };
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
        if (!response.ok) return classifyStatus(response.status);
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
