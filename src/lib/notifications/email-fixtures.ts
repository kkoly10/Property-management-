import "server-only";
import { renderAuthEmail, type AuthEmailActionType } from "./auth-email";
import { renderEmailHtml } from "./html-email";
import { senderFor, unsubscribeUrlFor, type MailAudience } from "./sender";
import { renderNotification } from "./templates";

/**
 * Render fixtures for visual review.
 *
 * Every value the fixture supplies is fixed — no dates from the clock, no random ids — so two renders
 * on one deployment are byte-identical and a screenshot diff means a real change.
 *
 * ONE thing here is not fixed, and it is worth knowing before reviewing a screenshot: every link in
 * these messages is BUILT by the template from `originForAudience`, which returns "" when
 * `NEXT_PUBLIC_SITE_URL` is unset. The template then emits a relative path, the renderer drops it
 * because only http(s) reaches an href, and the message renders with no button. That is the demo
 * build's configuration showing through, not the template — `templates.test.ts` pins the absolute URLs
 * with the origins stubbed. To review these the way a recipient sees them, run the preview with
 * `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_LIVING_ROOT_DOMAIN` and `NEXT_PUBLIC_OWNER_ORIGIN` set.
 *
 * That now includes the invitations. They used to carry a ready-made absolute URL in their payload and
 * so rendered identically anywhere; they now carry an opaque TOKEN HASH and the worker assembles the
 * `/auth/confirm` link itself, precisely so that no payload can decide where an invitation points.
 *
 * Thirteen fixtures in total. Nine are the messages worth looking at with human eyes — the three
 * invitations, the three category messages, and the three authentication messages a recipient is most
 * likely to receive while under time pressure. The other four are the layout stress cases below.
 *
 * They exist for local review only. The route that serves them refuses to run in production.
 */
export type EmailFixture = {
  id: string;
  title: string;
  audience: MailAudience;
  html: string;
  /** The plain-text half, so the multipart pair can be reviewed together. */
  text: string;
  subject: string;
};

const ORGANIZATION = "Northstar Property Group";
/** A fixed Supabase magic-link token hash. The invitation link is BUILT from it, never carried. */
const AUTH_TOKEN_HASH = "fixture0token0hash0value00000000";
/** Already assembled, for the auth-email fixtures — those take a finished URL rather than a hash. */
const AUTH_LINK = `https://app.crecyos.com/auth/confirm?token_hash=${AUTH_TOKEN_HASH}&type=magiclink&next=%2Fsettings%2Fteam%2Faccept`;

type NotificationFixture = {
  id: string;
  title: string;
  templateCode: string;
  locale: string;
  audience: MailAudience;
  payload: Record<string, unknown>;
};

const NOTIFICATION_FIXTURES: NotificationFixture[] = [
  {
    id: "staff-invitation",
    title: "Crecy — staff invitation",
    templateCode: "staff_invitation",
    locale: "en-US",
    audience: "operator",
    payload: { organizationName: ORGANIZATION, roleCode: "property_manager", expiresAt: "2026-09-21T10:00:00Z", mfaRequired: true, authTokenHash: AUTH_TOKEN_HASH },
  },
  {
    id: "resident-invitation",
    title: "Crecy Living — resident invitation",
    templateCode: "resident_invitation",
    locale: "en-US",
    audience: "resident",
    payload: { organizationName: ORGANIZATION, expiresAt: "2026-09-21T10:00:00Z", authTokenHash: AUTH_TOKEN_HASH },
  },
  {
    id: "owner-invitation",
    title: "Crecy Owner — owner invitation",
    templateCode: "owner_invitation",
    locale: "en-US",
    audience: "owner",
    payload: { organizationName: ORGANIZATION, expiresAt: "2026-09-21T10:00:00Z", authTokenHash: AUTH_TOKEN_HASH },
  },
  {
    id: "document-delivered",
    title: "Document available",
    templateCode: "document_delivered",
    locale: "en-US",
    audience: "resident",
    payload: { organizationName: ORGANIZATION, documentTitle: "Lease renewal — 12 Maple Court, Apt 4B", secureLinkUrl: "https://app.crecyos.com/documents/secure/fixture-token", expiresAt: "2026-09-25T10:00:00Z" },
  },
  {
    id: "announcement",
    title: "Announcement",
    templateCode: "announcement_published",
    locale: "en-US",
    audience: "resident",
    payload: { organizationName: ORGANIZATION, title: "Water will be shut off on Tuesday between 9am and 1pm" },
  },
  {
    id: "conversation-message",
    title: "New message",
    templateCode: "conversation_message_received",
    locale: "en-US",
    audience: "resident",
    payload: { organizationName: ORGANIZATION },
  },
];

/**
 * The four stress cases. Not part of the nine representative messages, but the ones a layout actually
 * breaks on: a very long organization name, the two non-English languages whose words run longer than
 * the English the layout was eyeballed against, and a document for a recipient with no portal — the
 * case that must render neither a portal button nor portal copy.
 */
const STRESS_FIXTURES: NotificationFixture[] = [
  {
    id: "staff-invitation-long-name",
    title: "Crecy — very long organization name",
    templateCode: "staff_invitation",
    locale: "en-US",
    audience: "operator",
    payload: {
      organizationName: "Northstar Residential Property Management and Associates of the Greater Metropolitan Region",
      roleCode: "maintenance_coordinator",
      expiresAt: "2026-09-21T10:00:00Z",
      mfaRequired: true,
      authTokenHash: AUTH_TOKEN_HASH,
    },
  },
  {
    id: "resident-invitation-es",
    title: "Crecy Living — español",
    templateCode: "resident_invitation",
    locale: "es-MX",
    audience: "resident",
    payload: { organizationName: ORGANIZATION, expiresAt: "2026-09-21T10:00:00Z", authTokenHash: AUTH_TOKEN_HASH },
  },
  {
    id: "owner-invitation-fr",
    title: "Crecy Owner — français",
    templateCode: "owner_invitation",
    locale: "fr-CA",
    audience: "owner",
    payload: { organizationName: ORGANIZATION, expiresAt: "2026-09-21T10:00:00Z", authTokenHash: AUTH_TOKEN_HASH },
  },
  {
    id: "document-delivered-no-portal",
    title: "Document — recipient with no portal",
    templateCode: "document_delivered",
    locale: "en-US",
    audience: "operator",
    payload: { organizationName: ORGANIZATION, documentTitle: "Signed vendor agreement" },
  },
];

const AUTH_FIXTURES: { id: string; title: string; actionType: AuthEmailActionType; audience: MailAudience }[] = [
  { id: "auth-magiclink", title: "Magic sign-in link", actionType: "magiclink", audience: "operator" },
  { id: "auth-recovery", title: "Password recovery", actionType: "recovery", audience: "resident" },
  { id: "auth-password-changed", title: "Security notification", actionType: "password_changed_notification", audience: "operator" },
];

export function listEmailFixtureIds(): string[] {
  return [...NOTIFICATION_FIXTURES.map((f) => f.id), ...STRESS_FIXTURES.map((f) => f.id), ...AUTH_FIXTURES.map((f) => f.id)];
}

export function renderEmailFixture(id: string): EmailFixture | null {
  const notification = [...NOTIFICATION_FIXTURES, ...STRESS_FIXTURES].find((f) => f.id === id);
  if (notification) {
    const rendered = renderNotification({
      templateCode: notification.templateCode,
      locale: notification.locale,
      payload: notification.payload,
      // The worker resolves this from the delivery row and renders with it; a fixture that omitted it
      // would show a `document_delivered` message with no button and misrepresent the real thing.
      audience: notification.audience,
    });
    if (!rendered) return null;
    const unsubscribeUrl = unsubscribeUrlFor(notification.templateCode, notification.audience);
    return {
      id: notification.id,
      title: notification.title,
      audience: notification.audience,
      subject: rendered.subject,
      text: rendered.body,
      html: renderEmailHtml({
        subject: rendered.subject,
        body: rendered.body,
        audience: notification.audience,
        unsubscribeUrl,
        language: rendered.language,
        preheader: rendered.preheader,
        paragraphs: rendered.paragraphs,
        heading: rendered.heading,
        ctaLabel: rendered.ctaLabel,
        ctaUrl: rendered.ctaUrl,
        details: rendered.details,
        securityNote: rendered.securityNote,
      }),
    };
  }

  const auth = AUTH_FIXTURES.find((f) => f.id === id);
  if (!auth) return null;
  const rendered = renderAuthEmail({ actionType: auth.actionType, language: "en", confirmUrl: AUTH_LINK, token: "481920" });
  const sender = senderFor("auth_email", auth.audience);
  return {
    id: auth.id,
    title: auth.title,
    audience: auth.audience,
    subject: rendered.subject,
    text: rendered.body,
    html: renderEmailHtml({
      subject: rendered.subject,
      body: rendered.body,
      audience: sender.audience,
      language: rendered.language,
      preheader: rendered.preheader,
      paragraphs: rendered.paragraphs,
      heading: rendered.heading,
      ctaLabel: rendered.ctaLabel,
      ctaUrl: rendered.ctaUrl,
      details: rendered.details,
      securityNote: rendered.securityNote,
      // Authentication mail is never unsubscribable.
      unsubscribeUrl: null,
    }),
  };
}
