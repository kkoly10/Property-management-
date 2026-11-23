import "server-only";

import { createAgreementSignInLink } from "@/lib/auth/agreement-sign-in-link";
import { passwordRecoveryUrl } from "@/lib/auth/password-recovery";
import { renderAuthEmail } from "@/lib/notifications/auth-email";
import { renderEmailHtml } from "@/lib/notifications/html-email";
import { sendViaResend } from "@/lib/notifications/resend";
import { senderFor } from "@/lib/notifications/sender";
import { originForAudience, type LinkAudience } from "@/lib/runtime/host";

type AuthLink = {
  email: string;
  tokenHash: string;
  audience: LinkAudience;
} & ({ actionType: "signup" | "magiclink"; next: string } | { actionType: "recovery" });

export async function sendAuthLink(input: AuthLink) {
  const origin = originForAudience(input.audience);
  if (!origin) return;

  const confirmUrl = input.actionType === "recovery"
    ? passwordRecoveryUrl(origin, input.tokenHash)
    : new URL("/auth/confirm", origin);
  if (input.actionType !== "recovery") {
    confirmUrl.searchParams.set("token_hash", input.tokenHash);
    confirmUrl.searchParams.set("type", input.actionType);
    confirmUrl.searchParams.set("next", input.next);
  }
  await deliverAuthLink(input.email, input.actionType, input.audience, confirmUrl);
}

export async function sendAgreementSignInLink(input: {
  email: string;
  tokenHash: string;
  invitationHash: string;
  agreementId: string;
}) {
  const origin = originForAudience("resident");
  if (!origin) return false;
  const url = createAgreementSignInLink(origin, {
    agreementId: input.agreementId, invitationHash: input.invitationHash, tokenHash: input.tokenHash,
  });
  return deliverAuthLink(input.email, "magiclink", "resident", url);
}

async function deliverAuthLink(email: string, actionType: AuthLink["actionType"], audience: LinkAudience, confirmUrl: URL) {
  const rendered = renderAuthEmail({ actionType, language: "en", confirmUrl: confirmUrl.toString() });
  const sender = senderFor("auth_email", audience);
  const message = {
    from: sender.from,
    to: email,
    subject: rendered.subject,
    text: rendered.body,
    html: renderEmailHtml({
      subject: rendered.subject,
      body: rendered.body,
      audience: sender.audience,
      language: "en" as const,
      preheader: rendered.preheader,
      paragraphs: rendered.paragraphs,
      heading: rendered.heading,
      ctaLabel: rendered.ctaLabel,
      ctaUrl: rendered.ctaUrl,
      details: rendered.details,
      securityNote: rendered.securityNote,
      unsubscribeUrl: null,
    }),
    replyTo: sender.replyTo,
    tags: [{ name: "auth_action", value: actionType }, { name: "audience", value: sender.audience }],
    // A newly rendered credential is a new delivery. The provider retry below reuses these exact
    // bytes and the key, without putting credential material in provider metadata.
    idempotencyKey: `auth-${actionType}-${crypto.randomUUID()}`,
  };

  const sent = await sendViaResend(message);
  return (!sent.ok && sent.retryable ? await sendViaResend(message) : sent).ok;
}
