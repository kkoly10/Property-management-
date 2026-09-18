import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateVendorSchema } from "@/lib/validation/maintenance";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ vendorId: string }> },
) {
  const parsed = updateVendorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the vendor details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to manage vendors.", 401);

  const { vendorId } = await params;
  const vendor = parsed.data;
  const { data, error } = await supabase.rpc("update_vendor", {
    p_organization_id: vendor.organizationId,
    p_vendor_id: vendorId,
    p_display_name: vendor.displayName,
    p_email: vendor.email,
    p_phone_e164: vendor.phoneE164,
    p_status: vendor.status,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });
  if (error || !data) {
    const code = error?.message ?? "";
    // The sentinel ladder, in the order the command raises them. VENDOR_NOT_FOUND covers both a bad id
    // and another organization's vendor, and says the same thing for each on purpose.
    if (code.includes("ORGANIZATION_SCOPE_DENIED")) return errorResponse("You do not have organization-wide maintenance access to manage vendors.", 403);
    if (code.includes("VENDOR_NOT_FOUND")) return errorResponse("That vendor is not in this organization.", 404);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original change.", 409);
    if (code.includes("COMMAND_IN_PROGRESS")) return errorResponse("That change is still being applied. Try again in a moment.", 409);
    if (code.includes("INVALID_VENDOR_STATUS")) return errorResponse("Choose active, inactive or archived.", 422);
    if (code.includes("INVALID_VENDOR_EMAIL")) return errorResponse("Enter a valid email address.", 422);
    if (code.includes("INVALID_VENDOR_PHONE")) return errorResponse("Use E.164 format, e.g. +14045551234.", 422);
    if (code.includes("INVALID_VENDOR_NAME")) return errorResponse("Enter a vendor name.", 422);
    return errorResponse("The vendor could not be updated.", 422);
  }
  return NextResponse.json(data);
}
