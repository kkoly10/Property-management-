import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/lib/organization/context";
import { saveRentalListingSchema } from "@/lib/validation/rental-listing";

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request) {
  const parsed = saveRentalListingSchema.safeParse(await request.json().catch(() => null));
  const operationKey = request.headers.get("idempotency-key");
  if (!parsed.success || !operationKey || operationKey.length < 8 || operationKey.length > 200) {
    return reply({ error: "Check the listing details and operation key." }, 400);
  }
  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== parsed.data.organizationId) {
    return reply({ error: "Your selected workspace changed. Return to My rentals before continuing." }, 409);
  }
  if (context.active.customerPath !== "self_managing") {
    return reply({ error: "Shareable listings are available only in a self-managing workspace." }, 403);
  }
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Sign in to manage this listing." }, 401);
  const { data, error } = await supabase.rpc("save_rental_listing", {
    p_organization_id: parsed.data.organizationId,
    p_unit_id: parsed.data.unitId,
    p_expected_version: parsed.data.expectedVersion,
    p_details: parsed.data.details,
    p_idempotency_key: operationKey,
  });
  if (error || !data) {
    const message = error?.message ?? "";
    if (error?.code === "42501") return reply({ error: "This rental is unavailable to your workspace." }, 403);
    if (message.includes("LISTING_VERSION_CONFLICT")) return reply({ error: "This listing changed elsewhere. Reload before saving again." }, 409);
    if (message.includes("IDEMPOTENCY_CONFLICT")) return reply({ error: "This save key was already used for different listing details." }, 409);
    if (message.includes("LISTING_PHOTO_NOT_READY")) return reply({ error: "Every selected photo must belong to this rental and pass scanning first." }, 422);
    if (message.includes("LISTING_CLOSED")) return reply({ error: "This listing is closed. Create a new rental listing instead of reopening it." }, 422);
    if (error?.code?.startsWith("22") || error?.code === "23514") return reply({ error: "Check the listing details. Nothing was changed." }, 422);
    return reply({ error: "The save result could not be confirmed. Retry with the same details and operation key." }, 502);
  }
  return reply(data, 200);
}
