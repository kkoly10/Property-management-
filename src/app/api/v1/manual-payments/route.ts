import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordManualPaymentSchema } from "@/lib/validation/finance";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const parsed = recordManualPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the payment details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to record a payment.", 401);

  const payment = parsed.data;
  const { data, error } = await supabase.rpc("record_manual_payment", {
    p_organization_id: payment.organizationId,
    p_tenancy_id: payment.tenancyId,
    p_source: payment.source,
    p_amount_minor: payment.amountMinor,
    p_currency_code: payment.currencyCode,
    p_received_at: payment.receivedAt,
    p_reason: payment.reason,
    p_evidence_document_id: payment.evidenceDocumentId ?? null,
    p_allocations: payment.allocations,
    p_external_reference: payment.externalReference || null,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });

  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("PROPERTY_SCOPE_DENIED")) return errorResponse("You do not have finance access for this property.", 403);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original payment.", 409);
    if (code.includes("DUPLICATE_EXTERNAL_REFERENCE")) return errorResponse("That payment reference has already been recorded.", 409);
    if (code.includes("PAYMENT_EVIDENCE_REQUIRED")) return errorResponse("Attach scanned-clean evidence for this payment.", 422);
    if (code.includes("PAYMENT_EVIDENCE_NOT_READY")) return errorResponse("The selected evidence is unavailable or has not passed scanning.", 422);
    if (code.includes("CHARGE_OVERALLOCATED") || code.includes("ALLOCATION_CHARGE_NOT_AVAILABLE")) return errorResponse("A selected charge is already paid or cannot accept that allocation.", 422);
    if (code.includes("ALLOCATION_TOTAL_MISMATCH")) return errorResponse("Allocations must equal the payment amount.", 422);
    return errorResponse("The payment could not be recorded. No financial rows were committed.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}
