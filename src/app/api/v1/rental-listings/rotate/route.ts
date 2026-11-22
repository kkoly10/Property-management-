import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/lib/organization/context";
import { rotateRentalListingSchema } from "@/lib/validation/rental-listing";

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request) {
  const parsed = rotateRentalListingSchema.safeParse(await request.json().catch(() => null));
  const operationKey = request.headers.get("idempotency-key");
  if (!parsed.success || !operationKey || operationKey.length < 8 || operationKey.length > 200) {
    return reply({ error: "Check the share-link request." }, 400);
  }
  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== parsed.data.organizationId
    || context.active.customerPath !== "self_managing") {
    return reply({ error: "This rental workspace is unavailable." }, 403);
  }
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Sign in to manage this listing." }, 401);
  const { data, error } = await supabase.rpc("rotate_rental_listing_link", {
    p_organization_id: parsed.data.organizationId,
    p_listing_id: parsed.data.listingId,
    p_expected_version: parsed.data.expectedVersion,
    p_idempotency_key: operationKey,
  });
  if (error || !data) {
    const message = error?.message ?? "";
    if (error?.code === "42501") return reply({ error: "This listing is outside your rental scope." }, 403);
    if (message.includes("LISTING_VERSION_CONFLICT")) return reply({ error: "This listing changed elsewhere. Reload before rotating its link." }, 409);
    if (message.includes("LISTING_CLOSED")) return reply({ error: "A closed listing cannot receive another share link." }, 422);
    if (message.includes("IDEMPOTENCY_CONFLICT")) return reply({ error: "This rotation operation was already used for another request." }, 409);
    return reply({ error: "The new share link could not be confirmed. Retry the same operation." }, 502);
  }
  return reply(data, 200);
}
