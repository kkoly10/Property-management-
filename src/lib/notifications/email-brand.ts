import type { NotificationLanguage } from "./templates";

/**
 * The email design system: one palette per product surface, and the chrome wording in every language.
 *
 * ── Colours are quoted, not chosen ───────────────────────────────────────────────────────────────
 *
 * Every value below is lifted from `src/app/globals.css`, where the three Crecy surfaces are already
 * defined (`:root`, `[data-crecy-surface="living"]`, `[data-crecy-surface="owner"]`). Email cannot use
 * CSS custom properties — most clients strip them — so the values are inlined here, but inventing a
 * "close enough" colour would mean transactional mail that does not match the product it comes from.
 *
 * One subtlety is load-bearing and is documented in globals.css itself: Crecy Living's identity green
 * `#01a065` is only 3.38:1 against white, so it is the WORDMARK colour and the darker `#067647` is the
 * action colour used behind white button text. Using the identity green for the call to action would
 * put 3.38:1 white-on-green in front of every resident. `action` and `wordmark` are therefore separate
 * fields here, and the button always uses `action`.
 *
 * ── Why the chrome is localized here ─────────────────────────────────────────────────────────────
 *
 * A message whose body is Spanish and whose button fallback, footer, security note and
 * manage-preferences link are English is not a localized email; it is an English email with a
 * translated paragraph. These strings are part of what the recipient reads, so they live beside the
 * templates and resolve through the same language.
 */
export type EmailAudience = "operator" | "resident" | "owner";

export type EmailPalette = {
  /** Product name in the header and footer. */
  name: string;
  /** Identity colour for the wordmark. May be too light for white text — see `action`. */
  wordmark: string;
  /** Button background. Always AA-safe behind white text. */
  action: string;
  /** Page background behind the card. */
  canvas: string;
  /** Tint for the detail block. */
  soft: string;
  ink: string;
  muted: string;
  hairline: string;
};

/** Values quoted from globals.css. `action` is `--action`; `wordmark` is `--brand`. */
export const EMAIL_PALETTE: Record<EmailAudience, EmailPalette> = {
  operator: {
    name: "Crecy",
    wordmark: "#3a37eb",
    action: "#3a37eb",
    canvas: "#f7f8fb",
    soft: "#efefff",
    ink: "#101828",
    muted: "#667085",
    hairline: "#e4e7ec",
  },
  resident: {
    name: "Crecy Living",
    wordmark: "#01a065",
    // NOT the identity green: #01a065 is 3.38:1 on white, so white button text on it fails AA.
    action: "#067647",
    canvas: "#f6f9f8",
    soft: "#e8f8f1",
    ink: "#101828",
    muted: "#667085",
    hairline: "#e4e7ec",
  },
  owner: {
    name: "Crecy Owner",
    wordmark: "#3a37eb",
    action: "#3a37eb",
    canvas: "#f8f9fc",
    soft: "#efefff",
    ink: "#101828",
    muted: "#667085",
    hairline: "#e4e7ec",
  },
};

export type EmailChrome = {
  /** Introduces the copyable raw URL under a security-sensitive button. */
  copyLink: string;
  /** Neutral button label when a message supplies none, `{brand}` replaced with the product name. */
  openBrand: string;
  /** Footer attribution, `{brand}` replaced with the product name. */
  sentBy: string;
  managePreferences: string;
  /** Shown when a message carries no explicit security note. */
  ignoreIfUnexpected: string;
  expiresIn72Hours: string;
  /** Column heading style labels used in the detail block. */
  organizationLabel: string;
  roleLabel: string;
  expiresLabel: string;
};

export const EMAIL_CHROME: Record<NotificationLanguage, EmailChrome> = {
  en: {
    copyLink: "If the button does not work, copy and paste this link into your browser:",
    openBrand: "Open {brand}",
    sentBy: "Sent by {brand}.",
    managePreferences: "Manage email preferences",
    ignoreIfUnexpected: "If you were not expecting this message, you can ignore it. Nothing happens until you open the link above.",
    expiresIn72Hours: "This invitation link expires 72 hours after it was sent.",
    organizationLabel: "Organization",
    roleLabel: "Role",
    expiresLabel: "Expires",
  },
  es: {
    copyLink: "Si el botón no funciona, copia y pega este enlace en tu navegador:",
    openBrand: "Abrir {brand}",
    sentBy: "Enviado por {brand}.",
    managePreferences: "Administrar preferencias de correo",
    ignoreIfUnexpected: "Si no esperabas este mensaje, puedes ignorarlo. No ocurre nada hasta que abras el enlace de arriba.",
    expiresIn72Hours: "Este enlace de invitación vence 72 horas después de su envío.",
    organizationLabel: "Organización",
    roleLabel: "Función",
    expiresLabel: "Vence",
  },
  fr: {
    copyLink: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    openBrand: "Ouvrir {brand}",
    sentBy: "Envoyé par {brand}.",
    managePreferences: "Gérer les préférences d'e-mail",
    ignoreIfUnexpected: "Si vous n'attendiez pas ce message, vous pouvez l'ignorer. Rien ne se passe tant que vous n'ouvrez pas le lien ci-dessus.",
    expiresIn72Hours: "Ce lien d'invitation expire 72 heures après son envoi.",
    organizationLabel: "Organisation",
    roleLabel: "Rôle",
    expiresLabel: "Expire le",
  },
};

/** BCP-47 value for the document `lang` attribute, so screen readers pronounce the mail correctly. */
export const EMAIL_HTML_LANG: Record<NotificationLanguage, string> = {
  en: "en",
  es: "es",
  fr: "fr",
};
