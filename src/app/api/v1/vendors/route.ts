import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createVendorSchema } from "@/lib/validation/maintenance";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const parsed = createVendorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the vendor details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to add a vendor.", 401);

  const vendor = parsed.data;
  const { data, error } = await supabase.rpc("create_vendor", {
    p_organization_id: vendor.organizationId,
    p_display_name: vendor.displayName,
    p_email: vendor.email ?? null,
    p_phone_e164: vendor.phoneE164 ?? null,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("ORGANIZATION_SCOPE_DENIED")) return errorResponse("You do not have organization-wide maintenance access to manage vendors.", 403);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original vendor.", 409);
    return errorResponse("The vendor could not be added.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}
