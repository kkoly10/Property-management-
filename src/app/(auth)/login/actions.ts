"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/actions/state";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";

function safeRedirectTarget(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
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

  redirect(safeRedirectTarget(result.data.next));
}
