"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/actions/state";
import { createClient } from "@/lib/supabase/server";
import { unitSchema } from "@/lib/validation/portfolio";

export async function createUnitAction(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  const result = unitSchema.safeParse(Object.fromEntries(formData));
  if (!result.success) return { status: "error", message: "Check the highlighted fields.", fieldErrors: result.error.flatten().fieldErrors };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("create_unit", {
      p_organization_id: result.data.organizationId,
      p_property_id: result.data.propertyId,
      p_building_id: null,
      p_unit_code: result.data.unitCode,
      p_unit_type: result.data.unitType || null,
      p_bedrooms: result.data.bedrooms ?? null,
      p_bathrooms: result.data.bathrooms ?? null,
      p_square_feet: result.data.squareFeet ?? null,
      p_idempotency_key: result.data.idempotencyKey,
    });
    if (error) return { status: "error", message: error.message, requestId: crypto.randomUUID() };
    redirect(`/app/properties/${result.data.propertyId}?unit_created=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { status: "error", message: error instanceof Error ? error.message : "Unable to create the unit.", requestId: crypto.randomUUID() };
  }
}
