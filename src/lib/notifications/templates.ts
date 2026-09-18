import { originForAudience, type LinkAudience } from "@/lib/runtime/host";
import { EMAIL_CHROME } from "@/lib/notifications/email-brand";
import "server-only";

/**
 * Transactional message bodies for the notification worker.
 *
 * ── Structured, and plain text derived from the structure ────────────────────────────────────────
 *
 * A template used to return a subject and a wall of prose, and the HTML renderer reconstructed the
 * call to action by running a regex over it. Templates now declare what a message IS — heading,
 * paragraphs, detail rows, one call to action, one security note — and BOTH parts are generated from
 * that single description. The plain-text body is composed here from the same fields the HTML uses, so
 * the two halves of a multipart message cannot drift apart: there is no second copy to forget.
 *
 * ── Locale ───────────────────────────────────────────────────────────────────────────────────────
 *
 * Locales are `en-US | es-MX | en-CA | fr-CA`; templates are written per base language and resolved
 * with an English fallback, so a new regional locale never drops a transactional message. Every
 * visible string resolves through that language — including the chrome (button fallback text, footer,
 * preference link, security note) in `email-brand.ts`. A Spanish body with an English footer is an
 * English email with a translated paragraph.
 *
 * ── Only capabilities that exist ─────────────────────────────────────────────────────────────────
 *
 * Invitation copy names what the recipient can actually do on the surface they are being invited to.
 * Resident mail does not promise online payment, because the payment provider is not activated for the
 * pilot and an invitation that opens onto a missing feature is a broken promise on first login. No
 * message claims an uploaded file has been inspected for malware, because scanning is deliberately not
 * active. Nothing here is marketing copy; these are operational messages.
 */
export type NotificationLanguage = "en" | "es" | "fr";

export type NotificationDetail = { label: string; value: string };

export type RenderedNotification = {
  subject: string;
  /** The plain-text part, composed from the structured fields below. Always sent. */
  body: string;
  /** Preview text shown beside the subject in a mail list. */
  preheader?: string;
  /**
   * The message's prose, separate from `body`.
   *
   * `body` is the finished plain-text part and therefore contains everything — heading, prose, detail
   * lines, link, security note. The HTML side needs the prose ALONE, because it renders the other
   * elements itself; handing it `body` made it print them a second time.
   */
  paragraphs?: string[];
  heading?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  details?: NotificationDetail[];
  securityNote?: string;
  language?: NotificationLanguage;
};

export type NotificationJobForRender = {
  templateCode: string;
  locale: string;
  payload: Record<string, unknown>;
  /**
   * The RECIPIENT's surface, where the template code cannot say it.
   *
   * `document_delivered` is the case: the same template reaches residents, owners and vendor contacts,
   * so its code identifies the message but not the portal. The worker resolves this from the delivery
   * row's `recipient_relationship_type` and passes it in — and it must do so BEFORE rendering, because
   * the portal link is part of what is rendered. Absent means "not resolved", and a template that
   * needs it then declines to guess rather than linking somebody to a console they cannot open.
   */
  audience?: LinkAudience | null;
};

export function resolveLanguage(locale: string): NotificationLanguage {
  const base = locale.slice(0, 2).toLowerCase();
  if (base === "es") return "es";
  if (base === "fr") return "fr";
  return "en";
}

/** Payload values are operator/resident supplied. Keep them inert: single line, bounded, no markup. */
function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const raw = typeof value === "string" ? value : String(value);
  return raw.replace(/[\r\n]+/g, " ").replace(/[<>]/g, "").trim().slice(0, 200) || fallback;
}

/**
 * A human role name.
 *
 * `roleCode` is an internal identifier — `org_owner`, `maintenance_coordinator` — and rendering it raw
 * put "invited to join Crecy as org_owner" in front of the person being invited. The mapping lives
 * here rather than in the payload so it resolves in the RECIPIENT's language; a label pre-rendered at
 * queue time would pick one language and ship it to everyone. An unknown code falls back to the
 * generic wording rather than leaking a new identifier the same way.
 */
const ROLE_LABELS: Record<string, Record<NotificationLanguage, string>> = {
  org_owner: { en: "Owner", es: "Propietario", fr: "Propriétaire" },
  org_admin: { en: "Administrator", es: "Administrador", fr: "Administrateur" },
  property_manager: { en: "Property manager", es: "Gestor de propiedades", fr: "Gestionnaire immobilier" },
  leasing_agent: { en: "Leasing agent", es: "Agente de arrendamiento", fr: "Agent de location" },
  accountant: { en: "Accountant", es: "Contador", fr: "Comptable" },
  maintenance_coordinator: { en: "Maintenance coordinator", es: "Coordinador de mantenimiento", fr: "Coordinateur de maintenance" },
  read_only_auditor: { en: "Read-only auditor", es: "Auditor de solo lectura", fr: "Auditeur de lecture seule" },
};

const GENERIC_ROLE: Record<NotificationLanguage, string> = {
  en: "Team member",
  es: "Miembro del equipo",
  fr: "Membre de l'équipe",
};

function roleLabel(value: unknown, language: NotificationLanguage): string {
  const code = typeof value === "string" ? value.trim() : "";
  return ROLE_LABELS[code]?.[language] ?? GENERIC_ROLE[language];
}

/**
 * An absolute link for ONE audience.
 *
 * NEXT_PUBLIC_SITE_URL means the operator application (app.crecyos.com), so using it for every
 * recipient sent residents and owners into Crecy OS. The audience comes from the template code, which
 * IS the relationship: staff_invitation is an operator, owner_invitation is an owner.
 */
function link(path: string, audience: LinkAudience): string {
  const origin = originForAudience(audience);
  return origin ? `${origin}${path}` : path;
}

/**
 * Where a delivered document actually lives, for THIS recipient.
 *
 * The portal path is not shared. `/documents` is the Crecy Living resident surface; an owner's is
 * `/owner/documents` on the owner origin; a vendor contact has no portal at all, because Crecy Vendor
 * is a reserved surface with nothing behind it (FD-037).
 *
 * This used to be `link("/documents", "operator")` for every recipient — the resident path on the
 * OPERATOR origin, which is a page that exists for nobody being emailed. An owner was sent to a
 * resident route on a console they have no account on, and a vendor to the same.
 *
 * Returning null is the honest answer for an unresolved or portal-less recipient. The caller then
 * renders no button rather than a link that fails one click later, which is not an improvement on
 * failing zero clicks later.
 */
function documentPortalUrl(audience: LinkAudience | null | undefined): string | null {
  if (audience === "resident") return link("/documents", "resident");
  if (audience === "owner") return link("/owner/documents", "owner");
  return null;
}

/**
 * The one link in an invitation email.
 *
 * `authTokenHash` is a Supabase magic-link token hash, minted by the route with `generateLink` and
 * attached to the queued job by a `service_role`-only command. The link is BUILT HERE, from this
 * worker's own origin, rather than carried in the payload: a URL supplied by a caller is a URL the
 * Crecy worker would then send under Crecy's From domain and branding, which is a phishing primitive
 * wearing our own envelope. The payload carries an opaque hash; the destination is never negotiable.
 *
 * Opening it lands on Crecy's `/auth/confirm`, which redeems the hash server-side with
 * `verifyOtp({ type: "magiclink", token_hash })`, writes the session to cookies, and then redirects to
 * `next` — the invitation acceptance path with the Crecy token. One click signs the person in AND
 * accepts, and there is no second competing email.
 *
 * `next` stays relative on purpose. `/auth/confirm` re-validates it with `safeRedirectPath` and builds
 * the final redirect from its own origin, so nothing here can steer a just-signed-in user off-site.
 *
 * When the hash is absent (a job queued before this shipped, or a credential already scrubbed) the
 * message falls back to the bare acceptance link with the Crecy token. That link still works for
 * somebody already signed in, and is a dead end for somebody who is not — strictly better than
 * rendering nothing, and exactly the state every invitation was in before.
 */
function invitationCta(p: Record<string, unknown>, path: string, audience: LinkAudience): string {
  const token = typeof p.invitationToken === "string" ? p.invitationToken.trim() : "";
  // base64url only — the shape the invitation route mints. Anything else is not appended.
  const acceptPath = token && /^[A-Za-z0-9_-]+$/.test(token)
    ? `${path}?token=${encodeURIComponent(token)}`
    : path;

  const hash = typeof p.authTokenHash === "string" ? p.authTokenHash.trim() : "";
  const origin = originForAudience(audience);
  if (!origin || !/^[A-Za-z0-9_-]{16,512}$/.test(hash)) return link(acceptPath, audience);

  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("token_hash", hash);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", acceptPath);
  return url.toString();
}

/** `2026-09-18T10:00:00Z` -> `2026-09-18`. A time of day is noise in an expiry a person reads. */
function dateOnly(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

type Composed = {
  subject: string;
  heading: string;
  paragraphs: string[];
  details?: NotificationDetail[];
  ctaLabel?: string;
  ctaUrl?: string;
  securityNote?: string;
};

/**
 * Compose both halves of the message from one description.
 *
 * The plain-text part is built here rather than written by hand, which is what guarantees it carries
 * the same heading, the same facts, the same link and the same security note as the HTML. A text-only
 * client gets a complete message, not a stub.
 */
function compose(parts: Composed, language: NotificationLanguage): RenderedNotification {
  const lines: string[] = [parts.heading, ...parts.paragraphs];
  if (parts.details?.length) {
    lines.push(parts.details.map((d) => `${d.label}: ${d.value}`).join("\n"));
  }
  if (parts.ctaUrl) {
    lines.push(parts.ctaLabel ? `${parts.ctaLabel}: ${parts.ctaUrl}` : parts.ctaUrl);
  }
  if (parts.securityNote) lines.push(parts.securityNote);

  return {
    subject: parts.subject,
    body: lines.join("\n\n"),
    preheader: parts.paragraphs[0] ?? parts.subject,
    paragraphs: parts.paragraphs,
    heading: parts.heading,
    ...(parts.ctaLabel ? { ctaLabel: parts.ctaLabel } : {}),
    ...(parts.ctaUrl ? { ctaUrl: parts.ctaUrl } : {}),
    ...(parts.details?.length ? { details: parts.details } : {}),
    ...(parts.securityNote ? { securityNote: parts.securityNote } : {}),
    language,
  };
}

/** Shared invitation shape: the same facts in three languages, differing only in wording. */
function invitationDetails(
  p: Record<string, unknown>,
  language: NotificationLanguage,
  options: { organization: string; withRole?: boolean },
): NotificationDetail[] {
  const chrome = EMAIL_CHROME[language];
  const details: NotificationDetail[] = [{ label: chrome.organizationLabel, value: options.organization }];
  if (options.withRole) details.push({ label: chrome.roleLabel, value: roleLabel(p.roleCode, language) });
  const expires = dateOnly(p.expiresAt);
  if (expires) details.push({ label: chrome.expiresLabel, value: expires });
  return details;
}

type TemplateBuilder = (payload: Record<string, unknown>, audience?: LinkAudience | null) => RenderedNotification;

const ORG_FALLBACK: Record<NotificationLanguage, string> = {
  en: "your property manager",
  es: "tu administrador",
  fr: "votre gestionnaire",
};

const TEMPLATES: Record<string, Record<NotificationLanguage, TemplateBuilder>> = {
  staff_invitation: {
    en: (p) => {
      const org = text(p.organizationName, ORG_FALLBACK.en);
      return compose({
        subject: `${org} invited you to join their team on Crecy`,
        heading: `You have been invited to ${org}`,
        paragraphs: [
          `${org} uses Crecy to run its properties, and has invited you to join the team. Opening the link below signs you in and accepts the invitation.`,
          ...(p.mfaRequired === true ? ["This role requires two-factor authentication. You will be asked to set it up after you sign in."] : []),
        ],
        details: invitationDetails(p, "en", { organization: org, withRole: true }),
        ctaLabel: "Accept the invitation",
        ctaUrl: invitationCta(p, "/settings/team/accept", "operator"),
        securityNote: `${EMAIL_CHROME.en.expiresIn72Hours} ${EMAIL_CHROME.en.ignoreIfUnexpected}`,
      }, "en");
    },
    es: (p) => {
      const org = text(p.organizationName, ORG_FALLBACK.es);
      return compose({
        subject: `${org} te invitó a unirte a su equipo en Crecy`,
        heading: `Te invitaron a ${org}`,
        paragraphs: [
          `${org} usa Crecy para administrar sus propiedades y te invitó a unirte al equipo. Al abrir el enlace de abajo inicias sesión y aceptas la invitación.`,
          ...(p.mfaRequired === true ? ["Esta función requiere autenticación de dos factores. Se te pedirá configurarla después de iniciar sesión."] : []),
        ],
        details: invitationDetails(p, "es", { organization: org, withRole: true }),
        ctaLabel: "Aceptar la invitación",
        ctaUrl: invitationCta(p, "/settings/team/accept", "operator"),
        securityNote: `${EMAIL_CHROME.es.expiresIn72Hours} ${EMAIL_CHROME.es.ignoreIfUnexpected}`,
      }, "es");
    },
    fr: (p) => {
      const org = text(p.organizationName, ORG_FALLBACK.fr);
      return compose({
        subject: `${org} vous invite à rejoindre son équipe sur Crecy`,
        heading: `Vous avez été invité à rejoindre ${org}`,
        paragraphs: [
          `${org} utilise Crecy pour gérer ses biens et vous invite à rejoindre l'équipe. En ouvrant le lien ci-dessous, vous vous connectez et acceptez l'invitation.`,
          ...(p.mfaRequired === true ? ["Ce rôle exige l'authentification à deux facteurs. Il vous sera demandé de la configurer après connexion."] : []),
        ],
        details: invitationDetails(p, "fr", { organization: org, withRole: true }),
        ctaLabel: "Accepter l'invitation",
        ctaUrl: invitationCta(p, "/settings/team/accept", "operator"),
        securityNote: `${EMAIL_CHROME.fr.expiresIn72Hours} ${EMAIL_CHROME.fr.ignoreIfUnexpected}`,
      }, "fr");
    },
  },

  resident_invitation: {
    // Deliberately no promise of online payment: the payment provider is not activated for the pilot,
    // and an invitation that opens onto a missing feature is a broken promise on the first visit.
    en: (p) => {
      const org = text(p.organizationName, ORG_FALLBACK.en);
      return compose({
        subject: `${org} set up your resident portal`,
        heading: "Your resident portal is ready",
        paragraphs: [
          `${org} uses Crecy Living to keep you up to date on your home. In your portal you can see your charges and balance, submit maintenance requests, and read the documents and messages your property manager sends you.`,
          "Opening the link below signs you in and sets up your access.",
        ],
        details: invitationDetails(p, "en", { organization: org }),
        ctaLabel: "Open my resident portal",
        ctaUrl: invitationCta(p, "/invitations/accept", "resident"),
        securityNote: `${EMAIL_CHROME.en.expiresIn72Hours} ${EMAIL_CHROME.en.ignoreIfUnexpected}`,
      }, "en");
    },
    es: (p) => {
      const org = text(p.organizationName, ORG_FALLBACK.es);
      return compose({
        subject: `${org} preparó tu portal de residente`,
        heading: "Tu portal de residente está listo",
        paragraphs: [
          `${org} usa Crecy Living para mantenerte al día sobre tu hogar. En tu portal puedes ver tus cargos y tu saldo, enviar solicitudes de mantenimiento y leer los documentos y mensajes que te envía tu administrador.`,
          "Al abrir el enlace de abajo inicias sesión y activas tu acceso.",
        ],
        details: invitationDetails(p, "es", { organization: org }),
        ctaLabel: "Abrir mi portal de residente",
        ctaUrl: invitationCta(p, "/invitations/accept", "resident"),
        securityNote: `${EMAIL_CHROME.es.expiresIn72Hours} ${EMAIL_CHROME.es.ignoreIfUnexpected}`,
      }, "es");
    },
    fr: (p) => {
      const org = text(p.organizationName, ORG_FALLBACK.fr);
      return compose({
        subject: `${org} a préparé votre portail résident`,
        heading: "Votre portail résident est prêt",
        paragraphs: [
          `${org} utilise Crecy Living pour vous tenir informé au sujet de votre logement. Dans votre portail, vous pouvez consulter vos frais et votre solde, soumettre des demandes d'entretien et lire les documents et messages de votre gestionnaire.`,
          "En ouvrant le lien ci-dessous, vous vous connectez et activez votre accès.",
        ],
        details: invitationDetails(p, "fr", { organization: org }),
        ctaLabel: "Ouvrir mon portail résident",
        ctaUrl: invitationCta(p, "/invitations/accept", "resident"),
        securityNote: `${EMAIL_CHROME.fr.expiresIn72Hours} ${EMAIL_CHROME.fr.ignoreIfUnexpected}`,
      }, "fr");
    },
  },

  owner_invitation: {
    en: (p) => {
      const org = text(p.organizationName, ORG_FALLBACK.en);
      return compose({
        subject: `${org} set up your owner portal`,
        heading: "Your owner portal is ready",
        paragraphs: [
          `${org} uses Crecy Owner to share how your properties are doing. In your portal you can review owner statements, respond to approval requests, and read the documents sent to you.`,
          "Opening the link below signs you in and sets up your access.",
        ],
        details: invitationDetails(p, "en", { organization: org }),
        ctaLabel: "Open my owner portal",
        ctaUrl: invitationCta(p, "/invitations/accept", "owner"),
        securityNote: `${EMAIL_CHROME.en.expiresIn72Hours} ${EMAIL_CHROME.en.ignoreIfUnexpected}`,
      }, "en");
    },
    es: (p) => {
      const org = text(p.organizationName, ORG_FALLBACK.es);
      return compose({
        subject: `${org} preparó tu portal de propietario`,
        heading: "Tu portal de propietario está listo",
        paragraphs: [
          `${org} usa Crecy Owner para compartir cómo van tus propiedades. En tu portal puedes revisar estados de cuenta, responder solicitudes de aprobación y leer los documentos que te envían.`,
          "Al abrir el enlace de abajo inicias sesión y activas tu acceso.",
        ],
        details: invitationDetails(p, "es", { organization: org }),
        ctaLabel: "Abrir mi portal de propietario",
        ctaUrl: invitationCta(p, "/invitations/accept", "owner"),
        securityNote: `${EMAIL_CHROME.es.expiresIn72Hours} ${EMAIL_CHROME.es.ignoreIfUnexpected}`,
      }, "es");
    },
    fr: (p) => {
      const org = text(p.organizationName, ORG_FALLBACK.fr);
      return compose({
        subject: `${org} a préparé votre portail propriétaire`,
        heading: "Votre portail propriétaire est prêt",
        paragraphs: [
          `${org} utilise Crecy Owner pour partager la performance de vos biens. Dans votre portail, vous pouvez consulter les relevés, répondre aux demandes d'approbation et lire les documents qui vous sont envoyés.`,
          "En ouvrant le lien ci-dessous, vous vous connectez et activez votre accès.",
        ],
        details: invitationDetails(p, "fr", { organization: org }),
        ctaLabel: "Ouvrir mon portail propriétaire",
        ctaUrl: invitationCta(p, "/invitations/accept", "owner"),
        securityNote: `${EMAIL_CHROME.fr.expiresIn72Hours} ${EMAIL_CHROME.fr.ignoreIfUnexpected}`,
      }, "fr");
    },
  },

  // A secure_link delivery points at a one-time tokenized URL the recipient can open without an
  // account; every other channel points at the portal. `secureLinkUrl` is injected by the worker at
  // send time and never persisted with the job. Nothing here claims the file was inspected or scanned.
  document_delivered: {
    en: (p, audience) => {
      const secure = typeof p.secureLinkUrl === "string" && /^https?:\/\//i.test(p.secureLinkUrl) ? p.secureLinkUrl : null;
      const portal = documentPortalUrl(audience);
      const expires = dateOnly(p.expiresAt);
      return compose({
        subject: `A document is available: ${text(p.documentTitle, "your document")}`,
        heading: text(p.documentTitle, "A document is available"),
        paragraphs: [
          `${text(p.organizationName, ORG_FALLBACK.en)} shared a document with you.`,
          "Some documents ask you to confirm you have read them.",
        ],
        ...(expires && secure ? { details: [{ label: EMAIL_CHROME.en.expiresLabel, value: expires }] } : {}),
        // No portal and no secure link means no button. A recipient with nowhere to go is told what
        // happened and nothing more; the alternative is a link that 404s or asks them to sign in to a
        // product they have no account on.
        ...(secure || portal ? { ctaLabel: secure ? "Open the document" : "Open it in your portal" } : {}),
        ...(secure || portal ? { ctaUrl: secure ?? portal! } : {}),
      }, "en");
    },
    es: (p, audience) => {
      const secure = typeof p.secureLinkUrl === "string" && /^https?:\/\//i.test(p.secureLinkUrl) ? p.secureLinkUrl : null;
      const portal = documentPortalUrl(audience);
      const expires = dateOnly(p.expiresAt);
      return compose({
        subject: `Hay un documento disponible: ${text(p.documentTitle, "tu documento")}`,
        heading: text(p.documentTitle, "Hay un documento disponible"),
        paragraphs: [
          `${text(p.organizationName, ORG_FALLBACK.es)} compartió un documento contigo.`,
          "Algunos documentos te piden confirmar que los leíste.",
        ],
        ...(expires && secure ? { details: [{ label: EMAIL_CHROME.es.expiresLabel, value: expires }] } : {}),
        // No portal and no secure link means no button. A recipient with nowhere to go is told what
        // happened and nothing more; the alternative is a link that 404s or asks them to sign in to a
        // product they have no account on.
        ...(secure || portal ? { ctaLabel: secure ? "Abrir el documento" : "Abrirlo en tu portal" } : {}),
        ...(secure || portal ? { ctaUrl: secure ?? portal! } : {}),
      }, "es");
    },
    fr: (p, audience) => {
      const secure = typeof p.secureLinkUrl === "string" && /^https?:\/\//i.test(p.secureLinkUrl) ? p.secureLinkUrl : null;
      const portal = documentPortalUrl(audience);
      const expires = dateOnly(p.expiresAt);
      return compose({
        subject: `Un document est disponible : ${text(p.documentTitle, "votre document")}`,
        heading: text(p.documentTitle, "Un document est disponible"),
        paragraphs: [
          `${text(p.organizationName, ORG_FALLBACK.fr)} a partagé un document avec vous.`,
          "Certains documents demandent une confirmation de lecture.",
        ],
        ...(expires && secure ? { details: [{ label: EMAIL_CHROME.fr.expiresLabel, value: expires }] } : {}),
        // No portal and no secure link means no button. A recipient with nowhere to go is told what
        // happened and nothing more; the alternative is a link that 404s or asks them to sign in to a
        // product they have no account on.
        ...(secure || portal ? { ctaLabel: secure ? "Ouvrir le document" : "Ouvrir dans votre portail" } : {}),
        ...(secure || portal ? { ctaUrl: secure ?? portal! } : {}),
      }, "fr");
    },
  },

  // Concise on purpose: the announcement itself is in the portal, and restating it here would send the
  // same words twice and make the message longer than what it is telling you.
  announcement_published: {
    en: (p) => compose({
      subject: text(p.title, "A new announcement from your property manager"),
      heading: text(p.title, "A new announcement"),
      paragraphs: [`${text(p.organizationName, ORG_FALLBACK.en)} posted an announcement for you.`],
      ctaLabel: "Read the announcement",
      ctaUrl: link("/home", "resident"),
    }, "en"),
    es: (p) => compose({
      subject: text(p.title, "Un nuevo aviso de tu administrador"),
      heading: text(p.title, "Un nuevo aviso"),
      paragraphs: [`${text(p.organizationName, ORG_FALLBACK.es)} publicó un aviso para ti.`],
      ctaLabel: "Leer el aviso",
      ctaUrl: link("/home", "resident"),
    }, "es"),
    fr: (p) => compose({
      subject: text(p.title, "Une nouvelle annonce de votre gestionnaire"),
      heading: text(p.title, "Une nouvelle annonce"),
      paragraphs: [`${text(p.organizationName, ORG_FALLBACK.fr)} a publié une annonce pour vous.`],
      ctaLabel: "Lire l'annonce",
      ctaUrl: link("/home", "resident"),
    }, "fr"),
  },

  // The message text itself is deliberately NOT in the email: it is not suppressible category mail
  // going to an address we cannot assume is private, and the portal is one click away.
  conversation_message_received: {
    en: () => compose({
      subject: "You have a new message",
      heading: "You have a new message",
      paragraphs: ["There is a new message waiting in your Crecy conversation."],
      ctaLabel: "Read the message",
      ctaUrl: link("/messages", "resident"),
    }, "en"),
    es: () => compose({
      subject: "Tienes un mensaje nuevo",
      heading: "Tienes un mensaje nuevo",
      paragraphs: ["Hay un mensaje nuevo esperando en tu conversación de Crecy."],
      ctaLabel: "Leer el mensaje",
      ctaUrl: link("/messages", "resident"),
    }, "es"),
    fr: () => compose({
      subject: "Vous avez un nouveau message",
      heading: "Vous avez un nouveau message",
      paragraphs: ["Un nouveau message vous attend dans votre conversation Crecy."],
      ctaLabel: "Lire le message",
      ctaUrl: link("/messages", "resident"),
    }, "fr"),
  },
};

/** Every template code that exists, so other modules can assert they cover all of them. */
export const TEMPLATE_CODES = Object.keys(TEMPLATES);

/** True when the worker knows how to render this template — an unknown code is a non-retryable failure. */
export function hasTemplate(templateCode: string): boolean {
  return Object.hasOwn(TEMPLATES, templateCode);
}

export function renderNotification(job: NotificationJobForRender): RenderedNotification | null {
  const byLanguage = TEMPLATES[job.templateCode];
  if (!byLanguage) return null;
  const language = resolveLanguage(job.locale);
  const build = byLanguage[language] ?? byLanguage.en;
  return build(job.payload ?? {}, job.audience ?? null);
}
