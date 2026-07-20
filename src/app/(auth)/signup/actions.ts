"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/validation/auth";
import type { ActionState } from "@/lib/actions/state";

export async function signupAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const result = signupSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });

  if (!result.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };
  }

  try {
    const supabase = await createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const { error } = await supabase.auth.signUp({
      email: result.data.email,
      password: result.data.password,
      options: { emailRedirectTo: `${siteUrl}/auth/callback` },
    });

    if (error) {
      return { status: "error", message: error.message, requestId: crypto.randomUUID() };
    }
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create the account.", requestId: crypto.randomUUID() };
  }

  redirect("/signup?check_email=1");
}
