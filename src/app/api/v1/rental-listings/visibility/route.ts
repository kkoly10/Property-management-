import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/lib/organization/context";
import { rentalListingVisibilitySchema } from "@/lib/validation/rental-listing";

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

const receiptSchema = z.object({
  listingId: z.uuid(),
  publicId: z.uuid(),
  status: z.enum(["draft", "published", "paused", "closed"]),
  visibility: z.enum(["unlisted", "discoverable"]),
  version: z.number().int().positive(),
  discoveredAt: z.string().nullable(),
}).strict();

export async function POST(request: Request) {
  const parsed = rentalListingVisibilitySchema.safeParse(await request.json().catch(() => null));
  const operationKey = request.headers.get("idempotency-key");
  if (!parsed.success || !operationKey || operationKey.length < 8 || operationKey.length > 200) {
    return reply({ error: "Check the discovery visibility request." }, 400);
  }

  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== parsed.data.organizationId
    || context.active.customerPath !== "self_managing") {
    return reply({ error: "This rental workspace is unavailable." }, 403);
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Sign in to manage discovery." }, 401);

  const { data, error } = await supabase.rpc("set_rental_listing_visibility", {
    p_organization_id: parsed.data.organizationId,
    p_listing_id: parsed.data.listingId,
    p_expected_version: parsed.data.expectedVersion,
    p_visibility: parsed.data.visibility,
    p_idempotency_key: operationKey,
  });
  if (error || !data) {
    const message = error?.message ?? "";
    if (error?.code === "42501") return reply({ error: "This listing is outside your rental scope." }, 403);
    if (message.includes("LISTING_VERSION_CONFLICT")) {
      return reply({ error: "This listing changed elsewhere. Reload before changing discovery." }, 409);
    }
    if (message.includes("LISTING_MUST_BE_PUBLISHED_FOR_DISCOVERY")) {
      return reply({ error: "Publish the shareable listing before adding it to Crecy discovery." }, 422);
    }
    if (message.includes("LISTING_PHOTO_REQUIRED") || message.includes("LISTING_SUMMARY_REQUIRED")) {
      return reply({ error: "Complete the listing description and scanner-clean photo before discovery." }, 422);
    }
    if (message.includes("LISTING_CLOSED")) return reply({ error: "A closed listing cannot enter discovery." }, 422);
    if (message.includes("IDEMPOTENCY_CONFLICT")) {
      return reply({ error: "This discovery operation key was already used for another request." }, 409);
    }
    return reply({ error: "The discovery result could not be confirmed. Retry the same operation." }, 502);
  }

  const receipt = receiptSchema.safeParse(data);
  if (!receipt.success
    || receipt.data.listingId !== parsed.data.listingId
    || receipt.data.visibility !== parsed.data.visibility
    || receipt.data.version <= parsed.data.expectedVersion
    || (parsed.data.visibility === "discoverable"
      && (receipt.data.status !== "published" || !receipt.data.discoveredAt))
    || (parsed.data.visibility === "unlisted" && receipt.data.discoveredAt !== null)) {
    return reply({ error: "The discovery result could not be confirmed. Retry the same operation." }, 502);
  }
  return reply(receipt.data, 200);
}
