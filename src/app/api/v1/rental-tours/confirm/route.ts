import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/lib/organization/context";
import { confirmRentalTourSchema } from "@/lib/validation/rental-tour";

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request) {
  const parsed = confirmRentalTourSchema.safeParse(await request.json().catch(() => null));
  const operationKey = request.headers.get("idempotency-key");
  if (!parsed.success || !operationKey || operationKey.length < 8 || operationKey.length > 200) {
    return reply({ error: "Check the tour confirmation request." }, 400);
  }

  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== parsed.data.organizationId) {
    return reply({ error: "Your selected workspace changed. Return to My rentals before continuing." }, 409);
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Sign in to manage tours." }, 401);

  const { data, error } = await supabase.rpc("confirm_rental_tour", {
    p_organization_id: parsed.data.organizationId,
    p_tour_request_id: parsed.data.tourRequestId,
    p_expected_version: parsed.data.expectedVersion,
    p_preference_position: parsed.data.preferencePosition,
    p_meeting_location: parsed.data.meetingLocation,
    p_idempotency_key: operationKey,
  });
  if (error || !data) {
    const message = error?.message ?? "";
    if (error?.code === "42501") return reply({ error: "This tour is outside your rental scope." }, 403);
    if (message.includes("TOUR_VERSION_CONFLICT")) {
      return reply({ error: "This tour changed elsewhere. Reload before confirming it." }, 409);
    }
    if (message.includes("IDEMPOTENCY_CONFLICT")) {
      return reply({ error: "This confirmation key was already used for a different request." }, 409);
    }
    if (message.includes("TOUR_SLOT_CONFLICT")) {
      return reply({ error: "That time now overlaps another confirmed tour for this rental." }, 422);
    }
    if (message.includes("TOUR_PREFERENCE_PAST")) {
      return reply({ error: "That preferred time has already passed." }, 422);
    }
    if (message.includes("TOUR_NOT_REQUESTED")) {
      return reply({ error: "This tour is no longer waiting for confirmation." }, 422);
    }
    if (message.includes("TOUR_PREFERENCE_NOT_FOUND") || message.includes("TOUR_NOT_FOUND")
      || error?.code === "P0002") {
      return reply({ error: "Tour request not found." }, 404);
    }
    return reply({ error: "The confirmation result could not be confirmed. Retry the same operation." }, 502);
  }
  return reply(data, 200);
}
