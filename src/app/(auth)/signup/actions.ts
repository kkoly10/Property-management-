"use server";

import { redirect } from "next/navigation";
import { signupSchema } from "@/lib/validation/auth";
import type { ActionState } from "@/lib/actions/state";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlausibleTokenHash } from "@/lib/auth/invitation-link";
import { renderAuthEmail } from "@/lib/notifications/auth-email";
import { renderEmailHtml } from "@/lib/notifications/html-email";
import { sendViaResend } from "@/lib/notifications/resend";
import { senderFor } from "@/lib/notifications/sender";
import { originForAudience } from "@/lib/runtime/host";

const SIGNUP_SUCCESS_PATH = "/signup?check_email=1";
const POST_CONFIRM_PATH = "/onboarding/organization";

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
 * those cases back into the same UI response so the signup form does not become an account-enumeration
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

export async function signupAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const result = signupSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });

  if (!result.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };
  }

  try {
    const admin = createAdminClient();

    // generateLink(type="signup") is Supabase's documented custom-email flow: it creates the
    // unconfirmed password account and returns the credential WITHOUT invoking Supabase's mailer.
    // That matters in production because the built-in Supabase mailer is intentionally restricted and
    // is not a customer-facing delivery path.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email: result.data.email,
      password: result.data.password,
    });

    if (error) {
      if (!isExistingAccountError(error)) {
        return signupFailure("We could not start account setup. Please try again.");
      }
      // Existing-account attempts deliberately fall through to the SAME neutral completion screen as
      // a new signup. Do not send a second kind of message here and do not reveal account existence.
    } else {
      const tokenHash = data?.properties?.hashed_token;
      const userId = data?.user?.id;
      if (!isPlausibleTokenHash(tokenHash) || !userId) {
        return signupFailure("We could not prepare the confirmation email. Please try again.");
      }

      const origin = originForAudience("operator");
      if (!origin) {
        return signupFailure("Crecy email confirmation is not configured yet.");
      }

      const confirmUrl = new URL("/auth/confirm", origin);
      confirmUrl.searchParams.set("token_hash", tokenHash);
      confirmUrl.searchParams.set("type", "signup");
      confirmUrl.searchParams.set("next", POST_CONFIRM_PATH);

      const rendered = renderAuthEmail({
        actionType: "signup",
        language: "en",
        confirmUrl: confirmUrl.toString(),
      });
      const sender = senderFor("auth_email", "operator");
      const message = {
        from: sender.from,
        to: result.data.email,
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
          { name: "auth_action", value: "signup" },
          { name: "audience", value: "operator" },
        ],
        // The user id is non-secret and stable for this signup. Retrying the provider call therefore
        // cannot send two copies of the same confirmation message within Resend's idempotency window.
        idempotencyKey: `signup-${userId}`,
      };

      let delivered = await sendViaResend(message);
      if (!delivered.ok && delivered.retryable) {
        // One retry is safe because the idempotency key is unchanged. This also covers the ambiguous
        // "provider accepted but our connection timed out" case without turning it into two emails.
        delivered = await sendViaResend(message);
      }

      if (!delivered.ok) {
        // A confirmation email that did not leave Crecy is not a completed signup. Best-effort cleanup
        // prevents a provider/configuration failure from leaving an unconfirmed account that blocks a
        // later retry. If the cleanup itself fails, the generic error still avoids exposing account
        // state; support can diagnose it from the request id.
        await admin.auth.admin.deleteUser(userId).catch(() => undefined);
        return signupFailure("We could not send the confirmation email. Please try again.");
      }
    }
  } catch {
    return signupFailure("Unable to create the account right now. Please try again.");
  }

  redirect(SIGNUP_SUCCESS_PATH);
}
