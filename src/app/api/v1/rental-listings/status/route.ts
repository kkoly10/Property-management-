import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/lib/organization/context";
import { rentalListingStatusSchema } from "@/lib/validation/rental-listing";

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request) {
  const parsed = rentalListingStatusSchema.safeParse(await request.json().catch(() => null));
  const operationKey = request.headers.get("idempotency-key");
  if (!parsed.success || !operationKey || operationKey.length < 8 || operationKey.length > 200) {
    return reply({ error: "Check the listing status request." }, 400);
  }
  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== parsed.data.organizationId
    || context.active.customerPath !== "self_managing") {
    return reply({ error: "This rental workspace is unavailable." }, 403);
  }
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Sign in to manage this listing." }, 401);
  const { data, error } = await supabase.rpc("set_rental_listing_status", {
    p_organization_id: parsed.data.organizationId,
    p_listing_id: parsed.data.listingId,
    p_expected_version: parsed.data.expectedVersion,
    p_status: parsed.data.status,
    p_idempotency_key: operationKey,
  });
  if (error || !data) {
    const message = error?.message ?? "";
    if (error?.code === "42501") return reply({ error: "This listing is outside your rental scope." }, 403);
    if (message.includes("LISTING_VERSION_CONFLICT")) return reply({ error: "This listing changed elsewhere. Reload before changing its status." }, 409);
    if (message.includes("LISTING_PHOTO_REQUIRED")) return reply({ error: "Add at least one scanner-clean photo before publishing." }, 422);
    if (message.includes("LISTING_SUMMARY_REQUIRED")) return reply({ error: "Add a short listing description before publishing." }, 422);
    if (message.includes("DISCOVERY_NOT_ENABLED")) return reply({ error: "Publish the listing as unlisted/shareable first. Discovery is a separate action after publication." }, 422);
    if (message.includes("LISTING_STATUS_TRANSITION_INVALID") || message.includes("LISTING_CLOSED")) {
      return reply({ error: "That listing status change is not available." }, 422);
    }
    if (message.includes("IDEMPOTENCY_CONFLICT")) return reply({ error: "This status operation was already used for another request." }, 409);
    return reply({ error: "The status result could not be confirmed. Retry the same operation." }, 502);
  }
  return reply(data, 200);
}
