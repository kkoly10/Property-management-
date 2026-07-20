"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { entityBookSchema } from "@/lib/validation/onboarding";
import type { ActionState } from "@/lib/actions/state";

export async function createEntityBookAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const result = entityBookSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };
  }

  try {
    const supabase = await createClient();
    const { data: memberships, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("organization_id")
      .eq("status", "active")
      .limit(1);

    if (membershipError || !memberships?.[0]) return { status: "error", message: "No active organization membership was found." };

    const { error } = await supabase.rpc("create_operating_entity_and_book", {
      p_organization_id: memberships[0].organization_id,
      p_legal_name: result.data.legalName,
      p_display_name: result.data.displayName,
      p_country_code: result.data.countryCode,
      p_entity_type: result.data.entityType,
      p_currency_code: result.data.currencyCode,
      p_book_name: result.data.bookName,
      p_idempotency_key: result.data.idempotencyKey,
    });

    if (error) return { status: "error", message: error.message, requestId: crypto.randomUUID() };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create the entity and book.", requestId: crypto.randomUUID() };
  }

  redirect("/app");
}
