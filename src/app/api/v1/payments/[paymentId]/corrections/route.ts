import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { correctPaymentSchema } from "@/lib/validation/finance";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const parsed = correctPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the correction details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to correct a payment.", 401);

  const correction = parsed.data;
  const { data, error } = await supabase.rpc("reverse_or_correct_payment", {
    p_payment_id: paymentId,
    p_correction_type: correction.correctionType,
    p_reason: correction.reason,
    p_expected_status: correction.expectedStatus,
    p_expected_version: correction.expectedVersion,
    p_replacement_allocations: correction.replacementAllocations ?? null,
    p_metadata_correction: correction.metadataCorrection ?? null,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });

  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("PROPERTY_SCOPE_DENIED")) return errorResponse("You do not have finance access for this property.", 403);
    if (code.includes("PAYMENT_NOT_FOUND")) return errorResponse("The payment was not found.", 404);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original correction.", 409);
    if (code.includes("PAYMENT_STATUS_CONFLICT") || code.includes("PAYMENT_VERSION_CONFLICT")) return errorResponse("This payment changed after you opened it. Refresh before correcting it.", 409);
    if (code.includes("PAYMENT_NOT_CORRECTABLE")) return errorResponse("This payment is already final and cannot be corrected again.", 409);
    if (code.includes("PROVIDER_PAYMENT_REQUIRES_REFUND_WORKFLOW")) return errorResponse("Provider payments must use the connected-account refund workflow.", 422);
    if (code.includes("CHARGE_OVERALLOCATED") || code.includes("ALLOCATION_CHARGE_NOT_AVAILABLE")) return errorResponse("A selected charge cannot accept that replacement allocation.", 422);
    if (code.includes("ALLOCATION_TOTAL_MISMATCH")) return errorResponse("Replacement allocations must equal the full payment amount.", 422);
    if (code.includes("DUPLICATE_EXTERNAL_REFERENCE")) return errorResponse("That external reference already belongs to another payment.", 409);
    return errorResponse("The correction could not be posted. No financial rows were committed.", 422);
  }

  return NextResponse.json(data);
}
