import "server-only";
import { hostConfig, originForAudience, originsAreLocal, type LinkAudience } from "@/lib/runtime/host";
import { NOTIFICATION_PREFERENCE_PATH } from "@/lib/notifications/preference-routes";

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
 *    then be unable to accept an invitation.
 *
 * 3. **An unsubscribe link is only offered when we know which portal the recipient signs in on.**
 *    Being category mail is necessary but NOT sufficient. The audience in rule 1 answers "whose brand
 *    is this from" and falls back to the neutral operator identity when the recipient could be more
 *    than one thing; treating that fallback as a recipient claim aims the header at a console the
 *    recipient has no account on. See `RECIPIENT_AUDIENCE`.
 */
export type MailAudience = LinkAudience;

/**
 * Template code -> audience, mirroring the `link(path, audience)` calls in templates.ts.
 *
 * `document_delivered` is deliberately "operator": a delivered document may go to a resident or an
 * owner and the template code does not say which, so it keeps the neutral origin rather than guessing
 * a recipient brand. A test asserts this map covers every template that exists.
 *
 * That neutral fallback is a statement about the FROM line only. For "who receives this, and where do
 * they manage preferences", read `RECIPIENT_AUDIENCE` — the two maps disagree on purpose.
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

/**
 * The mail domain for an audience: the sending subdomain of the domain its links point at.
 *
 * `mail.` matches the convention already used across every other Resend domain in this account
 * (mail.crecystudio.com, mail.korent.app, ...), so Crecy is not the odd one out.
 *
 * Ideally resident mail sends from the Crecy Living domain, because the From domain should match the
 * links in the body. Where only one sending domain can be verified, set CRECY_MAIL_FROM_RESIDENT to an
 * address on the verified domain: authentication still passes (SPF/DKIM/DMARC bind to the From domain
 * either way) and only the brand alignment is degraded, which is the right thing to trade away last
 * and to reverse first.
 */
function defaultMailDomain(audience: MailAudience): string {
  const { marketing, livingRoot } = hostConfig();
  return audience === "resident" ? `mail.${livingRoot}` : `mail.${marketing}`;
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
  /**
   * True when the recipient may opt out — category mail only.
   *
   * NECESSARY BUT NOT SUFFICIENT for a List-Unsubscribe header: the header also needs a portal the
   * recipient can actually sign in to. Use `unsubscribeUrlFor`, which checks both; branching on this
   * flag alone is what sent document_delivered recipients to the operator console.
   */
  unsubscribable: boolean;
};

/**
 * A recipient's relationship type, as stored on the delivery, mapped to the brand that should appear
 * in the From line.
 *
 * `vendor_contact` maps to the operator identity deliberately: Crecy Vendor is a reserved surface with
 * nothing built behind it (FD-037), so inventing a vendor brand in a From line would advertise a
 * product that does not exist.
 */
export function audienceForRelationshipType(relationshipType: string | null | undefined): MailAudience | null {
  if (relationshipType === "resident_person") return "resident";
  if (relationshipType === "owner_entity") return "owner";
  if (relationshipType === "vendor_contact") return "operator";
  return null;
}

/**
 * `audienceOverride` carries an audience the caller resolved from data the template code cannot express.
 * `document_delivered` is the case that needs it: the same template reaches residents and owners, so
 * the template code alone would send half of them from the wrong brand. When no override is supplied
 * the mapping falls back to the template, and an unknown template falls back to the operator identity
 * rather than guessing a recipient brand.
 */
export function senderFor(templateCode: string, audienceOverride?: MailAudience | null): SenderIdentity {
  const audience = audienceOverride ?? TEMPLATE_AUDIENCE[templateCode] ?? "operator";
  const override = envIdentity(`CRECY_MAIL_FROM_${audience.toUpperCase()}`);
  const from = override ?? `${DISPLAY_NAME[audience]} <notifications@${defaultMailDomain(audience)}>`;

  const { marketing, livingRoot } = hostConfig();
  const replyDomain = audience === "resident" ? livingRoot : marketing;
  const replyTo = envIdentity(`CRECY_MAIL_REPLY_TO_${audience.toUpperCase()}`)
    ?? (originsAreLocal() ? null : `support@${replyDomain}`);

  return { from, replyTo, audience, unsubscribable: !isAccessMail(templateCode) };
}

/**
 * Which surface the RECIPIENT signs in on — deliberately NOT the same question as `TEMPLATE_AUDIENCE`.
 *
 * `TEMPLATE_AUDIENCE` answers "whose brand does this come from", and it falls back to the neutral
 * operator identity when a template's recipient could be more than one thing. That fallback is a
 * considered non-answer about the recipient, and reading it as an answer is a live trap:
 * `document_delivered` resolves its recipient through `public.user_relationships`, whose
 * `relationship_type` is constrained to resident_person/owner_entity/vendor_contact, so it reaches
 * residents and owners and NEVER an operator. Sending its unsubscribe link to the operator console
 * would point a resident at a domain they have no account on.
 *
 * `null` therefore means "we cannot say which portal this recipient uses", and the consequence is that
 * no unsubscribe URL is offered at all. A header aimed at a sign-in the recipient cannot pass is the
 * same broken promise as one aimed at a page that does not exist — the failure just happens one click
 * later. A test asserts every template has an entry here, so a new one cannot default silently.
 */
const RECIPIENT_AUDIENCE: Record<string, MailAudience | null> = {
  staff_invitation: "operator",
  resident_invitation: "resident",
  owner_invitation: "owner",
  // Resident or owner — the static default is null, but the worker resolves the real audience per
  // delivery from recipient_relationship_type and passes it to unsubscribeUrlFor as an override.
  document_delivered: null,
  announcement_published: "resident",
  conversation_message_received: "resident",
};

/**
 * The URL a recipient may unsubscribe at, or null when no honest URL can be named.
 *
 * Two independent reasons to return null, and keeping both HERE means a caller cannot attach a link to
 * access mail — or to mail whose recipient is ambiguous — by forgetting to check for itself:
 *
 *   1. Access mail. Unsubscribing from the message that grants you access would lock you out.
 *   2. Unknown recipient surface, per `RECIPIENT_AUDIENCE` above.
 */
export function unsubscribeUrlFor(templateCode: string, audienceOverride?: MailAudience | null): string | null {
  if (isAccessMail(templateCode)) return null;
  // The override wins when the caller resolved a per-recipient audience the template code cannot
  // express — document_delivered reaching a resident vs an owner. Without it, the static map decides,
  // and a template with no honest audience (or an ambiguous one and no override) yields no header.
  const audience = audienceOverride ?? RECIPIENT_AUDIENCE[templateCode] ?? null;
  if (!audience) return null;
  const origin = originForAudience(audience);
  // In local development all three audiences collapse onto the one app origin, which is still absolute
  // and still works. The empty case is an unconfigured NEXT_PUBLIC_SITE_URL: emit no header at all
  // rather than a bare path, because a relative URL in a mail header is a dead link.
  return origin ? `${origin}${NOTIFICATION_PREFERENCE_PATH[audience]}` : null;
}

/** Exposed so a test can assert every template is classified rather than silently defaulting to null. */
export function hasRecipientAudienceEntry(templateCode: string): boolean {
  return Object.hasOwn(RECIPIENT_AUDIENCE, templateCode);
}
