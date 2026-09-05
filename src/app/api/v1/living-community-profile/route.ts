import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { livingCommunityProfileSchema } from "@/lib/validation/living-community";

const errorResponse = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

export async function PUT(request: Request) {
  const parsed = livingCommunityProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Check the community profile.", 400);
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return errorResponse("A valid idempotency key is required.", 400);
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to update this property.", 401);

  const input = parsed.data;
  const { data, error } = await supabase.rpc("save_living_community_profile", {
    p_property_id: input.propertyId,
    p_subdomain: input.subdomain,
    p_display_name: input.displayName,
    p_public_address_text: input.publicAddressText || null,
    p_headline: input.headline || null,
    p_leasing_email: input.leasingEmail || null,
    p_leasing_phone_e164: input.leasingPhoneE164 || null,
    p_office_hours_text: input.officeHours,
    p_amenities: input.amenities,
    p_public_notice_title: input.publicNoticeTitle || null,
    p_public_notice_body: input.publicNoticeBody || null,
    p_status: input.status,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: idempotencyKey,
  });

  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("PROPERTY_SCOPE_DENIED")) {
      return errorResponse("You do not have permission to manage this property.", 403);
    }
    if (code.includes("VERSION_CONFLICT")) {
      return errorResponse("This community profile changed in another session. Refresh before saving again.", 409);
    }
    if (code.includes("IDEMPOTENCY_CONFLICT") || code.includes("COMMAND_IN_PROGRESS")) {
      return errorResponse("That save is already being processed. Refresh before retrying.", 409);
    }
    if (error?.code === "42883" || code.includes("save_living_community_profile")) {
      return errorResponse("Community publishing is not active on this Crecy database yet.", 503);
    }
    return errorResponse("The community profile could not be saved.", 422);
  }

  return NextResponse.json(data);
}
