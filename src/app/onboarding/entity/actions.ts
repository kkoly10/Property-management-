"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { entityBookSchema } from "@/lib/validation/onboarding";
import type { ActionState } from "@/lib/actions/state";

export async function createEntityBookAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const result = entityBookSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };
  }

  try {
    const supabase = await createClient();
    // Onboarding creates the entity for the organization the operator is CURRENTLY in, not whichever
    // membership row the database happened to return first (this read had no ordering at all). During
    // onboarding there is normally exactly one, and the context selects it automatically; an operator
    // who already has several must have chosen one before they get here.
    const organizationId = await getActiveOrganizationId();
    if (!organizationId) return { status: "error", message: "Select an organization before creating an entity." };

    const { error } = await supabase.rpc("create_operating_entity_and_book", {
      p_organization_id: organizationId,
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

  redirect("/onboarding/property");
}
