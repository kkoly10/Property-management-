"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/actions/state";
import { createClient } from "@/lib/supabase/server";
import { propertySchema } from "@/lib/validation/portfolio";

const countryProfiles = { US: "US_NATIONAL", CA: "CA_NATIONAL", MX: "MX_NATIONAL" } as const;

export async function createPropertyAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const result = propertySchema.safeParse(Object.fromEntries(formData));
  if (!result.success) return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };

  try {
    const supabase = await createClient();
    const { data: book, error: bookError } = await supabase
      .from("accounting_books")
      .select("organization_id,operating_entity_id")
      .eq("id", result.data.accountingBookId)
      .maybeSingle();
    if (bookError || !book) return { status: "error", message: "That accounting book is not available to your workspace." };

    const { data, error } = await supabase.rpc("create_property", {
      p_organization_id: book.organization_id,
      p_operating_entity_id: book.operating_entity_id,
      p_accounting_book_id: result.data.accountingBookId,
      p_country_profile_code: countryProfiles[result.data.countryCode],
      p_name: result.data.name,
      p_property_type: result.data.propertyType,
      p_address_line1: result.data.addressLine1,
      p_address_line2: result.data.addressLine2 || null,
      p_locality: result.data.locality || null,
      p_subdivision_code: result.data.subdivisionCode || null,
      p_postal_code: result.data.postalCode || null,
      p_country_code: result.data.countryCode,
      p_time_zone: result.data.timeZone,
      p_idempotency_key: result.data.idempotencyKey,
    });
    if (error) return { status: "error", message: error.message, requestId: crypto.randomUUID() };
    redirect(`/app/properties/${data.propertyId}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create the property.", requestId: crypto.randomUUID() };
  }
}
