"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { organizationSchema } from "@/lib/validation/onboarding";
import type { ActionState } from "@/lib/actions/state";

export async function createOrganizationAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const result = organizationSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };
  }

  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return { status: "error", message: "Your session expired. Sign in and try again." };

    const { error } = await supabase.rpc("create_organization", {
      p_display_name: result.data.displayName,
      p_slug: result.data.slug,
      p_customer_path: result.data.customerPath,
      p_headquarters_country_code: result.data.headquartersCountryCode,
      p_default_locale: result.data.defaultLocale,
      p_default_time_zone: result.data.defaultTimeZone,
      p_terms_version: "2026-07-20",
      p_idempotency_key: result.data.idempotencyKey,
    });

    if (error) return { status: "error", message: error.message, requestId: crypto.randomUUID() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create the workspace.", requestId: crypto.randomUUID() };
  }

  redirect("/onboarding/entity");
}
