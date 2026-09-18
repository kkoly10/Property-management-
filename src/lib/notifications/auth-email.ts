import "server-only";
import type { NotificationLanguage, RenderedNotification } from "./templates";

/**
 * The Supabase Auth email family, rendered by Crecy instead of by Supabase's built-in templates.
 *
 * Supabase's Send Email Auth Hook hands us the user and an `email_data` block and expects US to
 * deliver the message. That is the only way authentication mail can look like the product it belongs
 * to; the alternative is a Crecy invitation in Crecy's design followed, on the next sign-in, by a bare
 * default template from a domain the recipient has never seen.
 *
 * ── Every action the contract can send ───────────────────────────────────────────────────────────
 *
 * Two families arrive at the same endpoint and must not be confused:
 *
 *   * ACTIONS — `signup`, `invite`, `magiclink`, `recovery`, `email_change`, `email`,
 *     `reauthentication`. These carry a credential and ask the recipient to do something.
 *   * NOTIFICATIONS — `*_notification`. These tell someone that something already happened to their
 *     account. They carry no credential and must never render a call to action, because there is
 *     nothing to confirm; a button on a "your password was changed" message is how a recipient gets
 *     trained to click one on a forged copy.
 *
 * Supporting a template is not enabling a notification: Supabase only sends these when the
 * corresponding setting is on. Rendering them here means that if one is switched on later it arrives
 * looking like Crecy rather than failing.
 *
 * ── What the copy may claim ──────────────────────────────────────────────────────────────────────
 *
 * Nothing that is not actually configured. `phone_changed_notification` does not promise SMS
 * capability; it reports a change. `reauthentication` shows a code rather than a link, because that is
 * what the contract provides for it.
 */
export type AuthEmailActionType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email"
  | "reauthentication"
  | "password_changed_notification"
  | "email_changed_notification"
  | "phone_changed_notification"
  | "identity_linked_notification"
  | "identity_unlinked_notification"
  | "mfa_factor_enrolled_notification"
  | "mfa_factor_unenrolled_notification";

export const AUTH_EMAIL_ACTION_TYPES: AuthEmailActionType[] = [
  "signup", "invite", "magiclink", "recovery", "email_change", "email", "reauthentication",
  "password_changed_notification", "email_changed_notification", "phone_changed_notification",
  "identity_linked_notification", "identity_unlinked_notification",
  "mfa_factor_enrolled_notification", "mfa_factor_unenrolled_notification",
];

/** True for the action types that carry no credential and must render no button. */
export function isSecurityNotification(actionType: AuthEmailActionType): boolean {
  return actionType.endsWith("_notification");
}

/**
 * The `verifyOtp` type for an action, or null when the action has no confirmation link.
 *
 * These are the values `EmailOtpType` accepts. `reauthentication` is absent deliberately: it is
 * verified with the six-digit code the user types back into the page they are already on.
 */
export const VERIFY_OTP_TYPE: Partial<Record<AuthEmailActionType, string>> = {
  signup: "signup",
  invite: "invite",
  magiclink: "magiclink",
  recovery: "recovery",
  email_change: "email_change",
  email: "email",
};

type Copy = { subject: string; heading: string; body: string; cta?: string; note?: string };

/**
 * Copy for every action in every language.
 *
 * Written flat rather than composed, because these are short, legally-plain security messages where a
 * clever abstraction costs more than it saves — and because each language needs to read naturally
 * rather than be assembled from translated fragments.
 */
const COPY: Record<AuthEmailActionType, Record<NotificationLanguage, Copy>> = {
  signup: {
    en: { subject: "Confirm your email address", heading: "Confirm your email address", body: "Confirm this address to finish setting up your Crecy account.", cta: "Confirm my email", note: "If you did not create a Crecy account, you can ignore this message." },
    es: { subject: "Confirma tu correo electrónico", heading: "Confirma tu correo electrónico", body: "Confirma esta dirección para terminar de configurar tu cuenta de Crecy.", cta: "Confirmar mi correo", note: "Si no creaste una cuenta de Crecy, puedes ignorar este mensaje." },
    fr: { subject: "Confirmez votre adresse e-mail", heading: "Confirmez votre adresse e-mail", body: "Confirmez cette adresse pour terminer la configuration de votre compte Crecy.", cta: "Confirmer mon adresse", note: "Si vous n'avez pas créé de compte Crecy, vous pouvez ignorer ce message." },
  },
  invite: {
    en: { subject: "You have been invited to Crecy", heading: "You have been invited to Crecy", body: "Open the link below to set up your access.", cta: "Accept the invitation", note: "If you were not expecting this, you can ignore this message." },
    es: { subject: "Te invitaron a Crecy", heading: "Te invitaron a Crecy", body: "Abre el enlace de abajo para activar tu acceso.", cta: "Aceptar la invitación", note: "Si no esperabas este mensaje, puedes ignorarlo." },
    fr: { subject: "Vous avez été invité sur Crecy", heading: "Vous avez été invité sur Crecy", body: "Ouvrez le lien ci-dessous pour activer votre accès.", cta: "Accepter l'invitation", note: "Si vous n'attendiez pas ce message, vous pouvez l'ignorer." },
  },
  magiclink: {
    en: { subject: "Your Crecy sign-in link", heading: "Sign in to Crecy", body: "Open the link below to sign in. It can only be used once.", cta: "Sign in", note: "If you did not ask to sign in, you can ignore this message. Nobody can sign in without opening the link." },
    es: { subject: "Tu enlace de acceso a Crecy", heading: "Inicia sesión en Crecy", body: "Abre el enlace de abajo para iniciar sesión. Solo puede usarse una vez.", cta: "Iniciar sesión", note: "Si no solicitaste iniciar sesión, puedes ignorar este mensaje. Nadie puede entrar sin abrir el enlace." },
    fr: { subject: "Votre lien de connexion Crecy", heading: "Connectez-vous à Crecy", body: "Ouvrez le lien ci-dessous pour vous connecter. Il ne peut servir qu'une fois.", cta: "Se connecter", note: "Si vous n'avez pas demandé à vous connecter, ignorez ce message. Personne ne peut se connecter sans ouvrir le lien." },
  },
  recovery: {
    en: { subject: "Reset your Crecy password", heading: "Reset your password", body: "Open the link below to choose a new password.", cta: "Choose a new password", note: "If you did not ask to reset your password, you can ignore this message and your password stays as it is." },
    es: { subject: "Restablece tu contraseña de Crecy", heading: "Restablece tu contraseña", body: "Abre el enlace de abajo para elegir una contraseña nueva.", cta: "Elegir una contraseña nueva", note: "Si no solicitaste restablecerla, puedes ignorar este mensaje y tu contraseña no cambia." },
    fr: { subject: "Réinitialisez votre mot de passe Crecy", heading: "Réinitialisez votre mot de passe", body: "Ouvrez le lien ci-dessous pour choisir un nouveau mot de passe.", cta: "Choisir un nouveau mot de passe", note: "Si vous n'avez pas fait cette demande, ignorez ce message : votre mot de passe reste inchangé." },
  },
  email_change: {
    en: { subject: "Confirm your new email address", heading: "Confirm your new email address", body: "Open the link below to confirm the change to your Crecy account.", cta: "Confirm the change", note: "If you did not ask to change your email address, contact your property manager." },
    es: { subject: "Confirma tu nuevo correo electrónico", heading: "Confirma tu nuevo correo electrónico", body: "Abre el enlace de abajo para confirmar el cambio en tu cuenta de Crecy.", cta: "Confirmar el cambio", note: "Si no solicitaste cambiar tu correo, comunícate con tu administrador." },
    fr: { subject: "Confirmez votre nouvelle adresse e-mail", heading: "Confirmez votre nouvelle adresse e-mail", body: "Ouvrez le lien ci-dessous pour confirmer le changement sur votre compte Crecy.", cta: "Confirmer le changement", note: "Si vous n'avez pas demandé ce changement, contactez votre gestionnaire." },
  },
  email: {
    en: { subject: "Confirm your email address", heading: "Confirm your email address", body: "Open the link below to confirm this address.", cta: "Confirm my email", note: "If you were not expecting this, you can ignore this message." },
    es: { subject: "Confirma tu correo electrónico", heading: "Confirma tu correo electrónico", body: "Abre el enlace de abajo para confirmar esta dirección.", cta: "Confirmar mi correo", note: "Si no esperabas este mensaje, puedes ignorarlo." },
    fr: { subject: "Confirmez votre adresse e-mail", heading: "Confirmez votre adresse e-mail", body: "Ouvrez le lien ci-dessous pour confirmer cette adresse.", cta: "Confirmer mon adresse", note: "Si vous n'attendiez pas ce message, vous pouvez l'ignorer." },
  },
  reauthentication: {
    en: { subject: "Your Crecy verification code", heading: "Your verification code", body: "Enter this code on the page you were using to confirm it is you.", note: "The code is only valid for a short time. If you did not ask for it, you can ignore this message." },
    es: { subject: "Tu código de verificación de Crecy", heading: "Tu código de verificación", body: "Escribe este código en la página que estabas usando para confirmar que eres tú.", note: "El código solo es válido por poco tiempo. Si no lo solicitaste, puedes ignorar este mensaje." },
    fr: { subject: "Votre code de vérification Crecy", heading: "Votre code de vérification", body: "Saisissez ce code sur la page que vous utilisiez pour confirmer votre identité.", note: "Le code n'est valable que peu de temps. Si vous ne l'avez pas demandé, ignorez ce message." },
  },
  password_changed_notification: {
    en: { subject: "Your Crecy password was changed", heading: "Your password was changed", body: "The password on your Crecy account was changed.", note: "If this was not you, contact your property manager straight away." },
    es: { subject: "Se cambió tu contraseña de Crecy", heading: "Se cambió tu contraseña", body: "Se cambió la contraseña de tu cuenta de Crecy.", note: "Si no fuiste tú, comunícate de inmediato con tu administrador." },
    fr: { subject: "Votre mot de passe Crecy a été modifié", heading: "Votre mot de passe a été modifié", body: "Le mot de passe de votre compte Crecy a été modifié.", note: "Si ce n'était pas vous, contactez immédiatement votre gestionnaire." },
  },
  email_changed_notification: {
    en: { subject: "The email address on your Crecy account changed", heading: "Your email address changed", body: "The email address on your Crecy account was changed.", note: "If this was not you, contact your property manager straight away." },
    es: { subject: "Cambió el correo de tu cuenta de Crecy", heading: "Cambió tu correo electrónico", body: "Se cambió el correo electrónico de tu cuenta de Crecy.", note: "Si no fuiste tú, comunícate de inmediato con tu administrador." },
    fr: { subject: "L'adresse e-mail de votre compte Crecy a changé", heading: "Votre adresse e-mail a changé", body: "L'adresse e-mail de votre compte Crecy a été modifiée.", note: "Si ce n'était pas vous, contactez immédiatement votre gestionnaire." },
  },
  phone_changed_notification: {
    en: { subject: "The phone number on your Crecy account changed", heading: "Your phone number changed", body: "The phone number on your Crecy account was changed.", note: "If this was not you, contact your property manager straight away." },
    es: { subject: "Cambió el teléfono de tu cuenta de Crecy", heading: "Cambió tu número de teléfono", body: "Se cambió el número de teléfono de tu cuenta de Crecy.", note: "Si no fuiste tú, comunícate de inmediato con tu administrador." },
    fr: { subject: "Le numéro de téléphone de votre compte Crecy a changé", heading: "Votre numéro de téléphone a changé", body: "Le numéro de téléphone de votre compte Crecy a été modifié.", note: "Si ce n'était pas vous, contactez immédiatement votre gestionnaire." },
  },
  identity_linked_notification: {
    en: { subject: "A new sign-in method was added to your Crecy account", heading: "A sign-in method was added", body: "A new way to sign in was added to your Crecy account.", note: "If this was not you, contact your property manager straight away." },
    es: { subject: "Se agregó un método de acceso a tu cuenta de Crecy", heading: "Se agregó un método de acceso", body: "Se agregó una nueva forma de iniciar sesión a tu cuenta de Crecy.", note: "Si no fuiste tú, comunícate de inmediato con tu administrador." },
    fr: { subject: "Une méthode de connexion a été ajoutée à votre compte Crecy", heading: "Une méthode de connexion a été ajoutée", body: "Une nouvelle façon de vous connecter a été ajoutée à votre compte Crecy.", note: "Si ce n'était pas vous, contactez immédiatement votre gestionnaire." },
  },
  identity_unlinked_notification: {
    en: { subject: "A sign-in method was removed from your Crecy account", heading: "A sign-in method was removed", body: "A way to sign in was removed from your Crecy account.", note: "If this was not you, contact your property manager straight away." },
    es: { subject: "Se quitó un método de acceso de tu cuenta de Crecy", heading: "Se quitó un método de acceso", body: "Se quitó una forma de iniciar sesión de tu cuenta de Crecy.", note: "Si no fuiste tú, comunícate de inmediato con tu administrador." },
    fr: { subject: "Une méthode de connexion a été retirée de votre compte Crecy", heading: "Une méthode de connexion a été retirée", body: "Une façon de vous connecter a été retirée de votre compte Crecy.", note: "Si ce n'était pas vous, contactez immédiatement votre gestionnaire." },
  },
  mfa_factor_enrolled_notification: {
    en: { subject: "Two-factor authentication was added to your Crecy account", heading: "Two-factor authentication was added", body: "A two-factor authentication method was added to your Crecy account.", note: "If this was not you, contact your property manager straight away." },
    es: { subject: "Se agregó autenticación de dos factores a tu cuenta de Crecy", heading: "Se agregó autenticación de dos factores", body: "Se agregó un método de autenticación de dos factores a tu cuenta de Crecy.", note: "Si no fuiste tú, comunícate de inmediato con tu administrador." },
    fr: { subject: "L'authentification à deux facteurs a été ajoutée à votre compte Crecy", heading: "L'authentification à deux facteurs a été ajoutée", body: "Une méthode d'authentification à deux facteurs a été ajoutée à votre compte Crecy.", note: "Si ce n'était pas vous, contactez immédiatement votre gestionnaire." },
  },
  mfa_factor_unenrolled_notification: {
    en: { subject: "Two-factor authentication was removed from your Crecy account", heading: "Two-factor authentication was removed", body: "A two-factor authentication method was removed from your Crecy account.", note: "If this was not you, contact your property manager straight away." },
    es: { subject: "Se quitó la autenticación de dos factores de tu cuenta de Crecy", heading: "Se quitó la autenticación de dos factores", body: "Se quitó un método de autenticación de dos factores de tu cuenta de Crecy.", note: "Si no fuiste tú, comunícate de inmediato con tu administrador." },
    fr: { subject: "L'authentification à deux facteurs a été retirée de votre compte Crecy", heading: "L'authentification à deux facteurs a été retirée", body: "Une méthode d'authentification à deux facteurs a été retirée de votre compte Crecy.", note: "Si ce n'était pas vous, contactez immédiatement votre gestionnaire." },
  },
};

export function isAuthEmailActionType(value: unknown): value is AuthEmailActionType {
  return typeof value === "string" && (AUTH_EMAIL_ACTION_TYPES as string[]).includes(value);
}

export type AuthEmailInput = {
  actionType: AuthEmailActionType;
  language: NotificationLanguage;
  /** The Crecy confirmation URL. Absent for notifications and for reauthentication. */
  confirmUrl?: string | null;
  /** The six-digit code, used only by `reauthentication`. */
  token?: string | null;
};

export function renderAuthEmail(input: AuthEmailInput): RenderedNotification {
  const copy = COPY[input.actionType][input.language] ?? COPY[input.actionType].en;
  const notification = isSecurityNotification(input.actionType);

  // A notification never gets a button: there is nothing to confirm, and training a recipient to click
  // one on a "something changed" message is how the forged copy succeeds later.
  // `copy.cta` is the gate, not just `confirmUrl`: an action with no button label has no call to
  // action at all. `reauthentication` is the case — it is verified with a typed code — and without
  // this the bare URL still reached the plain-text part while the HTML showed no button, which is both
  // inconsistent and a link the message was never supposed to carry.
  const ctaUrl = !notification && copy.cta && input.confirmUrl && /^https?:\/\//i.test(input.confirmUrl)
    ? input.confirmUrl
    : null;
  const code = input.actionType === "reauthentication" && input.token ? input.token : null;

  const lines = [copy.heading, copy.body];
  if (code) lines.push(code);
  if (ctaUrl) lines.push(copy.cta ? `${copy.cta}: ${ctaUrl}` : ctaUrl);
  if (copy.note) lines.push(copy.note);

  return {
    subject: copy.subject,
    body: lines.join("\n\n"),
    preheader: copy.body,
    // The prose alone. `body` above also carries the heading, the code and the note, and the HTML
    // renderer draws each of those itself.
    paragraphs: [copy.body],
    heading: copy.heading,
    ...(ctaUrl && copy.cta ? { ctaLabel: copy.cta, ctaUrl } : {}),
    ...(code ? { details: [{ label: copy.heading, value: code }] } : {}),
    ...(copy.note ? { securityNote: copy.note } : {}),
    language: input.language,
  };
}
