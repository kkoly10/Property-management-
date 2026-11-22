import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activateExistingLeaseSchema } from "@/lib/validation/leasing";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const parsed = activateExistingLeaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the lease and household details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to activate a tenancy.", 401);

  const { data, error } = await supabase.rpc("activate_existing_lease", {
    p_organization_id: parsed.data.organizationId,
    p_property_id: parsed.data.propertyId,
    p_unit_id: parsed.data.unitId,
    p_household: parsed.data.household,
    p_lease: parsed.data.lease,
    p_opening_balance_minor: parsed.data.openingBalanceMinor ?? 0,
    p_first_charge_due_date: parsed.data.firstChargeDueDate ?? null,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("PROPERTY_SCOPE_DENIED") || code.includes("FINANCE_PERMISSION_REQUIRED")) return errorResponse("You do not have permission for this property or opening balance.", 403);
    if (code.includes("TENANCY_HANDBACK_OVERLAP")) return errorResponse("These dates overlap the previous household’s recorded possession. Choose a start after its handback date.", 409);
    if (/TENANCY_OVERLAP|tenancies_unit_reservation_dates_excl/.test(code)) return errorResponse("This unit already has an overlapping active or scheduled tenancy.", 409);
    if (/TENANCY_POSSESSION_ACTIVE|tenancies_unit_one_physical_possession/.test(code)) return errorResponse("Another household still holds possession of this unit.", 409);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original activation request.", 409);
    if (code.includes("AGREEMENT_HOUSEHOLD_MISMATCH")) return errorResponse("Responsible renters must match the verified email addresses that signed the filed agreement.", 409);
    if (code.includes("AGREEMENT_SIGNING_ADDRESS_CHANGED")) return errorResponse("A renter’s verified email has changed since signing. Issue a new signing request before activation.", 409);
    if (/AGREEMENT_TENANCY_SCOPE_MISMATCH|AGREEMENT_TENANCY_ALREADY_BOUND/.test(code)) return errorResponse("This filed agreement is unavailable for the selected tenancy. Check the exact scanned PDF and rental.", 409);
    if (code.includes("SIGNED_DOCUMENT_NOT_READY")) return errorResponse("Choose a signed lease that is active and has passed malware scanning.", 422);
    if (code.includes("CURRENCY_MISMATCH")) return errorResponse("Lease currency must match the property accounting book.", 422);
    return errorResponse("The tenancy could not be activated. No lease or financial rows were committed.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}
