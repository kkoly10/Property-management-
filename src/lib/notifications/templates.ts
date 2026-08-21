import "server-only";

/**
 * Transactional message bodies for the notification worker.
 *
 * Locales in this product are `en-US | es-MX | en-CA | fr-CA`; templates are written per base language
 * and resolved with an English fallback, so a new regional locale never drops a transactional message.
 * Bodies are plain text on purpose — the relay is free to wrap them, and plain text cannot smuggle
 * markup from a payload value into a recipient's mail client.
 */
export type NotificationLanguage = "en" | "es" | "fr";

export type RenderedNotification = {
  subject: string;
  body: string;
};

export type NotificationJobForRender = {
  templateCode: string;
  locale: string;
  payload: Record<string, unknown>;
};

export function resolveLanguage(locale: string): NotificationLanguage {
  const base = locale.slice(0, 2).toLowerCase();
  if (base === "es") return "es";
  if (base === "fr") return "fr";
  return "en";
}

function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured || configured.includes("replace_me")) return "";
  return configured.replace(/\/+$/, "");
}

/** Payload values are operator/resident supplied. Keep them inert: single line, bounded, no markup. */
function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const raw = typeof value === "string" ? value : String(value);
  return raw.replace(/[\r\n]+/g, " ").replace(/[<>]/g, "").trim().slice(0, 200) || fallback;
}

function link(path: string): string {
  const origin = siteUrl();
  return origin ? `${origin}${path}` : path;
}

type TemplateBuilder = (payload: Record<string, unknown>) => RenderedNotification;

const TEMPLATES: Record<string, Record<NotificationLanguage, TemplateBuilder>> = {
  staff_invitation: {
    en: (p) => ({
      subject: `You have been invited to join ${text(p.organizationName, "your team")} on Crecy`,
      body: `You have been invited to join ${text(p.organizationName, "your team")} on Crecy as ${text(p.roleCode, "a team member")}.\n\nAccept the invitation: ${link("/settings/team/accept")}\n\nIf you were not expecting this, you can ignore this message.`,
    }),
    es: (p) => ({
      subject: `Te invitaron a unirte a ${text(p.organizationName, "tu equipo")} en Crecy`,
      body: `Te invitaron a unirte a ${text(p.organizationName, "tu equipo")} en Crecy como ${text(p.roleCode, "miembro del equipo")}.\n\nAcepta la invitación: ${link("/settings/team/accept")}\n\nSi no esperabas este mensaje, puedes ignorarlo.`,
    }),
    fr: (p) => ({
      subject: `Vous avez été invité à rejoindre ${text(p.organizationName, "votre équipe")} sur Crecy`,
      body: `Vous avez été invité à rejoindre ${text(p.organizationName, "votre équipe")} sur Crecy en tant que ${text(p.roleCode, "membre de l'équipe")}.\n\nAccepter l'invitation : ${link("/settings/team/accept")}\n\nSi vous n'attendiez pas ce message, vous pouvez l'ignorer.`,
    }),
  },
  resident_invitation: {
    en: (p) => ({
      subject: `Your resident portal for ${text(p.organizationName, "your home")} is ready`,
      body: `You can now access your resident portal to view charges, make payments, and submit maintenance requests.\n\nAccept the invitation: ${link("/invitations/accept")}\n\nIf you were not expecting this, you can ignore this message.`,
    }),
    es: (p) => ({
      subject: `Tu portal de residente para ${text(p.organizationName, "tu hogar")} está listo`,
      body: `Ya puedes acceder a tu portal de residente para ver cargos, hacer pagos y enviar solicitudes de mantenimiento.\n\nAcepta la invitación: ${link("/invitations/accept")}\n\nSi no esperabas este mensaje, puedes ignorarlo.`,
    }),
    fr: (p) => ({
      subject: `Votre portail résident pour ${text(p.organizationName, "votre logement")} est prêt`,
      body: `Vous pouvez maintenant accéder à votre portail résident pour consulter les frais, payer et soumettre des demandes d'entretien.\n\nAccepter l'invitation : ${link("/invitations/accept")}\n\nSi vous n'attendiez pas ce message, vous pouvez l'ignorer.`,
    }),
  },
  owner_invitation: {
    en: (p) => ({
      subject: `Your owner portal for ${text(p.organizationName, "your portfolio")} is ready`,
      body: `You can now access your owner portal to review statements, approvals, and property performance.\n\nAccept the invitation: ${link("/invitations/accept")}\n\nIf you were not expecting this, you can ignore this message.`,
    }),
    es: (p) => ({
      subject: `Tu portal de propietario para ${text(p.organizationName, "tu portafolio")} está listo`,
      body: `Ya puedes acceder a tu portal de propietario para revisar estados de cuenta, aprobaciones y el desempeño de tus propiedades.\n\nAcepta la invitación: ${link("/invitations/accept")}\n\nSi no esperabas este mensaje, puedes ignorarlo.`,
    }),
    fr: (p) => ({
      subject: `Votre portail propriétaire pour ${text(p.organizationName, "votre portefeuille")} est prêt`,
      body: `Vous pouvez maintenant accéder à votre portail propriétaire pour consulter les relevés, les approbations et la performance de vos biens.\n\nAccepter l'invitation : ${link("/invitations/accept")}\n\nSi vous n'attendiez pas ce message, vous pouvez l'ignorer.`,
    }),
  },
  document_delivered: {
    en: (p) => ({
      subject: `A new document is available: ${text(p.documentTitle, "your document")}`,
      body: `${text(p.organizationName, "Your property manager")} shared a document with you: ${text(p.documentTitle, "your document")}.\n\nOpen it in your portal: ${link("/documents")}\n\nSome documents ask you to confirm you have read them.`,
    }),
    es: (p) => ({
      subject: `Hay un documento nuevo disponible: ${text(p.documentTitle, "tu documento")}`,
      body: `${text(p.organizationName, "Tu administrador")} compartió un documento contigo: ${text(p.documentTitle, "tu documento")}.\n\nÁbrelo en tu portal: ${link("/documents")}\n\nAlgunos documentos te piden confirmar que los leíste.`,
    }),
    fr: (p) => ({
      subject: `Un nouveau document est disponible : ${text(p.documentTitle, "votre document")}`,
      body: `${text(p.organizationName, "Votre gestionnaire")} a partagé un document avec vous : ${text(p.documentTitle, "votre document")}.\n\nOuvrez-le dans votre portail : ${link("/documents")}\n\nCertains documents demandent une confirmation de lecture.`,
    }),
  },
  announcement_published: {
    en: (p) => ({
      subject: text(p.title, "A new announcement from your property manager"),
      body: `${text(p.title, "A new announcement")}\n\nRead it in your portal: ${link("/home")}`,
    }),
    es: (p) => ({
      subject: text(p.title, "Un nuevo aviso de tu administrador"),
      body: `${text(p.title, "Un nuevo aviso")}\n\nLéelo en tu portal: ${link("/home")}`,
    }),
    fr: (p) => ({
      subject: text(p.title, "Une nouvelle annonce de votre gestionnaire"),
      body: `${text(p.title, "Une nouvelle annonce")}\n\nConsultez-la dans votre portail : ${link("/home")}`,
    }),
  },
  conversation_message_received: {
    en: () => ({
      subject: "You have a new message",
      body: `You have a new message in your Crecy conversation.\n\nRead it: ${link("/messages")}`,
    }),
    es: () => ({
      subject: "Tienes un mensaje nuevo",
      body: `Tienes un mensaje nuevo en tu conversación de Crecy.\n\nLéelo: ${link("/messages")}`,
    }),
    fr: () => ({
      subject: "Vous avez un nouveau message",
      body: `Vous avez un nouveau message dans votre conversation Crecy.\n\nLisez-le : ${link("/messages")}`,
    }),
  },
};

/** True when the worker knows how to render this template — an unknown code is a non-retryable failure. */
export function hasTemplate(templateCode: string): boolean {
  return Object.hasOwn(TEMPLATES, templateCode);
}

export function renderNotification(job: NotificationJobForRender): RenderedNotification | null {
  const byLanguage = TEMPLATES[job.templateCode];
  if (!byLanguage) return null;
  const language = resolveLanguage(job.locale);
  const build = byLanguage[language] ?? byLanguage.en;
  return build(job.payload ?? {});
}
