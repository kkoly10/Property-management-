"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/actions/state";
import { isPlausibleTokenHash } from "@/lib/auth/invitation-link";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { AUTH_SURFACE_COPY, authSurfaceFor } from "@/lib/auth/surface-copy";
import { renderAuthEmail } from "@/lib/notifications/auth-email";
import { renderEmailHtml } from "@/lib/notifications/html-email";
import { sendViaResend } from "@/lib/notifications/resend";
import { senderFor } from "@/lib/notifications/sender";
import { classifyHost } from "@/lib/runtime/host";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signInLinkSchema } from "@/lib/validation/auth";

/**
 * Where to land someone who signed in without a `next`.
 *
 * Derived from the host the request actually arrived on, because "/app" is the operator workspace and
 * a resident signing in at crecyliving.com was being sent straight into it. The host chooses a
 * default landing path and nothing more — what they can then see is still their relationship and RLS.
 */
async function defaultLandingPath(): Promise<string> {
  return AUTH_SURFACE_COPY[authSurfaceFor(classifyHost((await headers()).get("host")))].homePath;
}

function rateKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function loginAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const result = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!result.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: result.data.email, password: result.data.password });

    if (error) {
      return { status: "error", message: "The email or password is incorrect.", requestId: crypto.randomUUID() };
    }
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to sign in.", requestId: crypto.randomUUID() };
  }

  redirect(safeRedirectPath(result.data.next, await defaultLandingPath()));
}

/**
 * Email a one-time sign-in link.
 *
 * This intentionally uses Supabase's admin generateLink + Crecy/Resend instead of signInWithOtp.
 * signInWithOtp sends Supabase's own PKCE email, whose callback needs the verifier cookie from the
 * browser that REQUESTED the link. Opening that email from iOS Mail in another browser context loses
 * the verifier and /auth/callback cannot exchange the code.
 *
 * generateLink returns the one-time token hash without sending. Crecy emails a link to /auth/confirm,
 * which redeems the hash directly with verifyOtp and therefore works even when the message is opened
 * in a different browser context.
 *
 * The browser response remains identical for an existing account, an unknown address, a throttled
 * request, or a provider failure so this form cannot be used as an account-enumeration oracle.
 */
export async function requestSignInLinkAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const result = signInLinkSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") || undefined,
  });

  if (!result.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };
  }

  const sent: ActionState = {
    status: "success",
    message: "If that address has a Crecy account, a sign-in link is on its way. It expires shortly, so open it soon.",
  };

  try {
    const headerList = await headers();
    const rawHost = headerList.get("x-forwarded-host") ?? headerList.get("host");
    if (!rawHost) return sent;

    const classification = classifyHost(rawHost);
    if (classification.kind === "unknown" || classification.kind === "marketing" || classification.kind === "vendor") {
      return sent;
    }

    const surface = authSurfaceFor(classification);
    const next = safeRedirectPath(result.data.next, AUTH_SURFACE_COPY[surface].homePath);

    const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim()
      || headerList.get("x-real-ip")?.trim()
      || "";
    const admin = createAdminClient();
    const { data: throttle, error: throttleError } = await admin.rpc("claim_public_signin_link_attempt", {
      p_email_hash: rateKey(`email:${result.data.email.trim().toLowerCase()}`),
      p_ip_hash: forwarded ? rateKey(`ip:${forwarded}`) : null,
    });
    if (throttleError || (throttle as { allowed?: unknown } | null)?.allowed !== true) return sent;

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: result.data.email,
    });
    const tokenHash = data?.properties?.hashed_token;
    const userId = data?.user?.id;
    if (error || !userId || !isPlausibleTokenHash(tokenHash)) return sent;

    const protoHeader = headerList.get("x-forwarded-proto");
    const proto = protoHeader === "http" || protoHeader === "https" ? protoHeader : "https";
    const origin = `${proto}://${rawHost}`;
    let confirmUrl: URL;
    try {
      confirmUrl = new URL("/auth/confirm", origin);
    } catch {
      return sent;
    }
    confirmUrl.searchParams.set("token_hash", tokenHash);
    confirmUrl.searchParams.set("type", "magiclink");
    confirmUrl.searchParams.set("next", next);

    const rendered = renderAuthEmail({
      actionType: "magiclink",
      language: "en",
      confirmUrl: confirmUrl.toString(),
    });
    const sender = senderFor("auth_email", surface);
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
        { name: "auth_action", value: "magiclink" },
        { name: "audience", value: sender.audience },
      ],
      // A fresh request must receive its fresh token, so do not key only on user id. Keep the random
      // request identity stable across the one provider retry below.
      idempotencyKey: `signin-link-${userId}-${crypto.randomUUID()}`,
    };

    const delivered = await sendViaResend(message);
    if (!delivered.ok && delivered.retryable) {
      await sendViaResend(message);
    }
    // Deliberately ignore the final result in the browser response. Returning "failed" only for known
    // accounts would reveal account existence.
  } catch {
    return sent;
  }

  return sent;
}
