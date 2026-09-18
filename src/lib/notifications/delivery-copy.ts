import type { InvitationDeliveryState } from "@/lib/data/invitation-delivery";

/**
 * What an operator is told about a pending invitation's email, in one place for every surface that
 * shows it — the team page, the resident directory and the owner workspace.
 *
 * The state that matters is `undeliverable`: a pending invitation whose mail dead-lettered will never
 * be accepted, and on every other surface it looks identical to one sitting unread in an inbox.
 *
 * `sent` means a mail transport ACCEPTED the message. It does not mean delivered, opened or read, and
 * the wording says so. Provider message ids, relay error bodies and other vendor internals never reach
 * this layer: they answer a question the operator did not ask and cannot act on.
 */
export const INVITATION_DELIVERY_COPY: Record<
  InvitationDeliveryState,
  { label: string; variant: "success" | "info" | "warning" | "destructive"; hint: string }
> = {
  sent: { label: "Email sent", variant: "success", hint: "A mail provider accepted this message." },
  sending: { label: "Sending", variant: "info", hint: "A worker is delivering this message now." },
  queued: { label: "Email queued", variant: "info", hint: "Waiting for the next delivery run." },
  retrying: { label: "Delivery delayed", variant: "warning", hint: "Delivery failed and will be retried." },
  undeliverable: { label: "Email delivery failed", variant: "destructive", hint: "Delivery was abandoned. Send a new invitation." },
  canceled: { label: "Not sent", variant: "warning", hint: "Delivery was cancelled before it was sent." },
  unknown: { label: "No delivery record", variant: "warning", hint: "This invitation predates delivery tracking." },
};
