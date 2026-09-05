"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/actions/state";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { AUTH_SURFACE_COPY, authSurfaceFor } from "@/lib/auth/surface-copy";
import { classifyHost } from "@/lib/runtime/host";
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
 * Two things this deliberately does NOT do:
 *
 *   * It never reveals whether an account exists. The success message is identical for a known
 *     address, an unknown one, and a rate-limited retry — otherwise this form becomes an account
 *     enumeration oracle, which is worse than the inconvenience it removes.
 *   * It never creates an account (`shouldCreateUser: false`). Sign-up is its own route with its own
 *     terms consent; a sign-in form that quietly provisions accounts would bypass that.
 *
 * The link returns through /auth/callback, carrying `next` so an invitation being accepted survives
 * the round trip. The origin is taken from the request, so a resident on crecyliving.com is sent back
 * to crecyliving.com rather than to the operator console.
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
    const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
    const proto = headerList.get("x-forwarded-proto") ?? "https";
    if (!host) return sent;

    const callback = new URL("/auth/callback", `${proto}://${host}`);
    callback.searchParams.set("next", safeRedirectPath(result.data.next, await defaultLandingPath()));

    const supabase = await createClient();
    await supabase.auth.signInWithOtp({
      email: result.data.email,
      options: { shouldCreateUser: false, emailRedirectTo: callback.toString() },
    });
  } catch {
    // Swallowed on purpose: a transport failure must not be distinguishable from an unknown address.
    return sent;
  }

  return sent;
}
