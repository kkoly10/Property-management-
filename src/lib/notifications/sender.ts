import "server-only";
import { hostConfig, originsAreLocal, type LinkAudience } from "@/lib/runtime/host";

/**
 * Who a transactional message comes FROM, and whether it may be unsubscribed from.
 *
 * Two rules drive everything here.
 *
 * 1. **The From domain matches the domain of the links in the body.** A resident message links to
 *    crecyliving.com, so it is sent from crecyliving.com. A mismatch between the From domain and the
 *    link domain is one of the strongest phishing signals a filter looks for, and it is also what a
 *    resident sees: mail about "Crecy Living" arriving from a domain they have no relationship with.
 *    This is why the audience map below is the same one the templates use for their links.
 *
 * 2. **Access mail can never be unsubscribed.** Invitations are how a resident, owner or staff member
 *    gets into Crecy at all. `private.notification_template_category` maps them to a NULL category
 *    precisely so preference suppression cannot silence them, and a List-Unsubscribe header would
 *    reintroduce exactly that: someone could unsubscribe from the message that grants them access and
 *    then be unable to accept an invitation. Category mail carries the header; access mail must not.
 */
export type MailAudience = LinkAudience;

/**
 * Template code -> audience, mirroring the `link(path, audience)` calls in templates.ts.
 *
 * `document_delivered` is deliberately "operator": a delivered document may go to a resident or an
 * owner and the template code does not say which, so it keeps the neutral origin rather than guessing
 * a recipient brand. A test asserts this map covers every template that exists.
 */
export const TEMPLATE_AUDIENCE: Record<string, MailAudience> = {
  staff_invitation: "operator",
  resident_invitation: "resident",
  owner_invitation: "owner",
  document_delivered: "operator",
  announcement_published: "resident",
  conversation_message_received: "resident",
};

/**
 * Templates with NO notification category, mirroring `private.notification_template_category`, which
 * returns NULL for anything that is not payments/maintenance/messages/documents/announcements.
 * These are access and security messages: never suppressed, never unsubscribable.
 */
export function isAccessMail(templateCode: string): boolean {
  return !(
    /^(payment|receipt)/.test(templateCode)
    || /^(maintenance|work_order)/.test(templateCode)
    || /^(conversation|message)/.test(templateCode)
    || /^(document|statement)/.test(templateCode)
    || /^announcement/.test(templateCode)
  );
}

function envIdentity(name: string): string | null {
  const value = process.env[name]?.trim();
  if (!value || value.includes("replace_me")) return null;
  return value;
}

/** The mail domain for an audience: the sending subdomain of the domain its links point at. */
function defaultMailDomain(audience: MailAudience): string {
  const { marketing, livingRoot } = hostConfig();
  return audience === "resident" ? `notifications.${livingRoot}` : `notifications.${marketing}`;
}

const DISPLAY_NAME: Record<MailAudience, string> = {
  operator: "Crecy",
  resident: "Crecy Living",
  owner: "Crecy Owner",
};

export type SenderIdentity = {
  from: string;
  replyTo: string | null;
  audience: MailAudience;
  /** True when the recipient may opt out — category mail only. */
  unsubscribable: boolean;
};

export function senderFor(templateCode: string): SenderIdentity {
  const audience = TEMPLATE_AUDIENCE[templateCode] ?? "operator";
  const override = envIdentity(`CRECY_MAIL_FROM_${audience.toUpperCase()}`);
  const from = override ?? `${DISPLAY_NAME[audience]} <notifications@${defaultMailDomain(audience)}>`;

  const { marketing, livingRoot } = hostConfig();
  const replyDomain = audience === "resident" ? livingRoot : marketing;
  const replyTo = envIdentity(`CRECY_MAIL_REPLY_TO_${audience.toUpperCase()}`)
    ?? (originsAreLocal() ? null : `support@${replyDomain}`);

  return { from, replyTo, audience, unsubscribable: !isAccessMail(templateCode) };
}
