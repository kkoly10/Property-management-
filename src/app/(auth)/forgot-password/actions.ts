"use server";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/actions/state";
import { isPlausibleTokenHash } from "@/lib/auth/invitation-link";
import { passwordRecoveryCookieOptions, readPasswordRecovery } from "@/lib/auth/password-recovery";
import { sendAuthLink } from "@/lib/auth/send-auth-link";
import { authSurfaceFor } from "@/lib/auth/surface-copy";
import { classifyHost } from "@/lib/runtime/host";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";
import { passwordRecoveryRequestSchema, passwordResetSchema } from "@/lib/validation/auth";

function rateKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function requestPasswordRecovery(_state: ActionState, formData: FormData): Promise<ActionState> {
  const result = passwordRecoveryRequestSchema.safeParse({ email: formData.get("email") });
  if (!result.success) {
    return { status: "error", message: "Check the email address.", fieldErrors: result.error.flatten().fieldErrors };
  }
  const neutral: ActionState = {
    status: "success",
    message: "If that address has a Crecy account, we’ll send a password reset link. If you don’t receive one, you can request another link.",
  };

  try {
    const request = await headers();
    const host = classifyHost(request.get("host"));
    if (host.kind === "unknown" || host.kind === "vendor" || host.kind === "marketing") return neutral;

    const email = result.data.email.toLowerCase();
    const forwarded = request.get("x-forwarded-for")?.split(",")[0]?.trim() || request.get("x-real-ip")?.trim();
    const admin = createAdminClient();
    // Recovery and magic-link requests share a budget, including the same per-IP key.
    const { data: claim, error: throttleError } = await admin.rpc("claim_public_signin_link_attempt", {
      p_email_hash: rateKey(`email:${email}`),
      p_ip_hash: forwarded ? rateKey(`ip:${forwarded}`) : null,
    });
    if (throttleError || (claim as { allowed?: unknown } | null)?.allowed !== true) return neutral;

    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    const tokenHash = data?.properties?.hashed_token;
    if (!error && data?.user?.id && isPlausibleTokenHash(tokenHash)) {
      await sendAuthLink({ actionType: "recovery", audience: authSurfaceFor(host), email, tokenHash });
    }
  } catch {
    // Provider and account outcomes stay indistinguishable at the public request boundary.
  }
  return neutral;
}

export async function resetPassword(_state: ActionState, formData: FormData): Promise<ActionState> {
  const result = passwordResetSchema.safeParse({
    flowId: formData.get("flowId"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!result.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };
  }

  const store = await cookies();
  const challenge = readPasswordRecovery(store);
  const expired: ActionState = {
    status: "error",
    message: "This reset link has expired, been used, or changed. Request a new link and try again.",
  };
  if (!challenge || challenge.flowId !== result.data.flowId) return expired;
  store.set(challenge.name, "", { ...passwordRecoveryCookieOptions(challenge.name), maxAge: 0 });

  let endedOtherSessions = false;
  try {
    const { url, publishableKey } = requirePublicSupabaseConfig();
    // Keep the email recovery session out of the browser and separate from any account already
    // signed in on the device. The only user being updated comes from this verified credential.
    const supabase = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const verified = await supabase.auth.verifyOtp({ type: "recovery", token_hash: challenge.tokenHash });
    if (verified.error || !verified.data.session || !verified.data.user) return expired;

    const saved = await supabase.auth.updateUser({ password: result.data.password });
    if (saved.error) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return { status: "error", message: "The password could not be saved. Request a new link and choose a different password." };
    }
    const logout = await supabase.auth.signOut({ scope: "global" }).catch(() => null);
    endedOtherSessions = logout !== null && !logout.error;
  } catch {
    return { status: "error", message: "We could not confirm the password change. Try signing in or request a new reset link." };
  }

  redirect(endedOtherSessions ? "/login?password_reset=1" : "/login?password_reset=1&session_notice=1");
}
