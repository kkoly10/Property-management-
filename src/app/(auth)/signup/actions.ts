"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signupSchema } from "@/lib/validation/auth";
import type { ActionState } from "@/lib/actions/state";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlausibleTokenHash } from "@/lib/auth/invitation-link";
import { renderAuthEmail, type AuthEmailActionType } from "@/lib/notifications/auth-email";
import { renderEmailHtml } from "@/lib/notifications/html-email";
import { sendViaResend } from "@/lib/notifications/resend";
import { senderFor } from "@/lib/notifications/sender";
import { originForAudience } from "@/lib/runtime/host";

const SIGNUP_SUCCESS_PATH = "/signup?check_email=1";

function authErrorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function authErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object" || !("message" in error)) return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

/**
 * Supabase intentionally avoids confirming whether an email already owns an account.
 *
 * The admin generate-link endpoint is not the public signUp endpoint, so it may return an explicit
 * existing-user error instead of the public endpoint's obfuscated success. We deliberately collapse
 * those cases back into the same browser response so this form never becomes an account-enumeration
 * oracle.
 */
function isExistingAccountError(error: unknown): boolean {
  const code = authErrorCode(error);
  if (code === "email_exists" || code === "user_already_exists") return true;
  return /already (?:been )?(?:registered|exists)|user.*already/i.test(authErrorMessage(error));
}

function signupFailure(message: string): ActionState {
  return { status: "error", message, requestId: crypto.randomUUID() };
}

function rateKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function claimSignupAttempt(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<"allowed" | "limited" | "unavailable"> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    || requestHeaders.get("x-real-ip")?.trim()
    || "";
  const { data, error } = await admin.rpc("claim_public_signup_attempt", {
    p_email_hash: rateKey(`email:${email.trim().toLowerCase()}`),
    p_ip_hash: forwarded ? rateKey(`ip:${forwarded}`) : null,
  });
  if (error) return "unavailable";
  return (data as { allowed?: unknown } | null)?.allowed === true ? "allowed" : "limited";
}

async function sendAuthLink(input: {
  email: string;
  actionType: Extract<AuthEmailActionType, "signup" | "magiclink">;
  tokenHash: string;
  next: string;
  idempotencyKey: string;
}): Promise<boolean> {
  const origin = originForAudience("operator");
  if (!origin) return false;

  const confirmUrl = new URL("/auth/confirm", origin);
  confirmUrl.searchParams.set("token_hash", input.tokenHash);
  confirmUrl.searchParams.set("type", input.actionType);
  confirmUrl.searchParams.set("next", input.next);

  const rendered = renderAuthEmail({
    actionType: input.actionType,
    language: "en",
    confirmUrl: confirmUrl.toString(),
  });
  const sender = senderFor("auth_email", "operator");
  const message = {
    from: sender.from,
    to: input.email,
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
    tags: [
      { name: "auth_action", value: input.actionType },
      { name: "audience", value: "operator" },
    ],
    idempotencyKey: input.idempotencyKey,
  };

  let delivered = await sendViaResend(message);
  if (!delivered.ok && delivered.retryable) {
    // Same key makes the retry safe even if the first request reached Resend and only the response was
    // lost.
    delivered = await sendViaResend(message);
  }
  return delivered.ok;
}

export async function signupAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const result = signupSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });

  if (!result.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };
  }

  try {
    const admin = createAdminClient();
    const throttle = await claimSignupAttempt(admin, result.data.email);
    if (throttle === "unavailable") {
      return signupFailure("Unable to start account setup right now. Please try again.");
    }
    if (throttle === "limited") {
      return signupFailure("Too many signup attempts. Wait a few minutes and try again.");
    }

    // Supabase documents generateLink(type="signup") as the custom-email signup flow: it creates the
    // unconfirmed password account and returns the credential without invoking Supabase's restricted
    // built-in mailer.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email: result.data.email,
      password: result.data.password,
    });

    if (error && isExistingAccountError(error)) {
      // An existing customer who lands on Sign up should not be left staring at a promise of an email
      // that will never arrive. Mint a one-time sign-in credential and send it through the SAME Crecy
      // provider. The browser still receives the same neutral completion state as a brand-new signup.
      const signIn = await admin.auth.admin.generateLink({ type: "magiclink", email: result.data.email });
      const tokenHash = signIn.data?.properties?.hashed_token;
      const userId = signIn.data?.user?.id;
      if (!signIn.error && isPlausibleTokenHash(tokenHash) && userId) {
        // /app is the canonical existing-operator landing point. Its layout redirects a signed-in user
        // with no membership to /onboarding/organization, while an onboarded user reaches their
        // workspace.
        await sendAuthLink({
          email: result.data.email,
          actionType: "magiclink",
          tokenHash,
          next: "/app",
          idempotencyKey: `signup-existing-${userId}`,
        });
      }
      // Fail closed on account enumeration: even if the recovery link could not be minted or sent, do
      // not make the browser response distinguish an existing account from a new one.
      redirect(SIGNUP_SUCCESS_PATH);
    }

    if (error) {
      return signupFailure("We could not start account setup. Please try again.");
    }

    const tokenHash = data?.properties?.hashed_token;
    const userId = data?.user?.id;
    if (!isPlausibleTokenHash(tokenHash) || !userId) {
      return signupFailure("We could not prepare the confirmation email. Please try again.");
    }

    const delivered = await sendAuthLink({
      email: result.data.email,
      actionType: "signup",
      tokenHash,
      next: "/onboarding/organization",
      idempotencyKey: `signup-${userId}`,
    });

    if (!delivered) {
      // A confirmation email that did not leave Crecy is not a completed signup. Best-effort cleanup
      // prevents a mail/configuration failure from leaving an unconfirmed account that blocks a later
      // retry.
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
      return signupFailure("We could not send the confirmation email. Please try again.");
    }
  } catch (error) {
    // Next.js redirects are implemented as throws. Never catch the redirect used by the intentional
    // existing-account neutral path above.
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) throw error;
    return signupFailure("Unable to create the account right now. Please try again.");
  }

  redirect(SIGNUP_SUCCESS_PATH);
}
