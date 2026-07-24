import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordOwnerRemittanceSchema } from "@/lib/validation/owner-remittances";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const parsed = recordOwnerRemittanceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the remittance details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to record an owner remittance.", 401);
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) return errorResponse("An idempotency key is required to record a remittance.", 400);

  const remittance = parsed.data;
  const { data, error } = await supabase.rpc("record_owner_remittance", {
    p_organization_id: remittance.organizationId,
    p_owner_entity_id: remittance.ownerEntityId,
    p_property_id: remittance.propertyId,
    p_statement_snapshot_id: remittance.statementSnapshotId ?? null,
    p_amount_minor: remittance.amountMinor,
    p_currency_code: remittance.currencyCode,
    p_paid_on: remittance.paidOn,
    p_external_reference: remittance.externalReference || null,
    p_evidence_document_id: remittance.evidenceDocumentId,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("OWNER_REMITTANCE_SCOPE_DENIED")) return errorResponse("You need owner and finance management access for this property.", 403);
    if (code.includes("OWNER_REMITTANCE_PLAN_UNAVAILABLE")) return errorResponse("Owner remittances require an active Growth or Pro plan.", 403);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original remittance.", 409);
    if (code.includes("DUPLICATE_EXTERNAL_REFERENCE")) return errorResponse("That external remittance reference has already been recorded for this property.", 409);
    if (code.includes("OWNER_STATEMENT_VERSION_SUPERSEDED")) return errorResponse("That statement has a newer corrected version. Refresh before recording the remittance.", 409);
    if (code.includes("STATEMENT_REMITTANCE_EXCEEDS_AVAILABLE")) return errorResponse("The amount is greater than the balance remaining on this statement.", 422);
    if (code.includes("OWNER_REMITTANCE_EXCEEDS_PAYABLE")) return errorResponse("The amount is greater than the current owner payable balance.", 422);
    if (code.includes("REMITTANCE_EVIDENCE_REQUIRED")) return errorResponse("Choose active, scanned-clean remittance evidence for this property.", 422);
    if (code.includes("INVALID_REMITTANCE_DATE")) return errorResponse("The paid date cannot be in the future.", 422);
    if (code.includes("CURRENCY_MISMATCH")) return errorResponse("The remittance currency must match the property accounting book.", 422);
    if (code.includes("OWNER_INTEREST_NOT_EFFECTIVE")) return errorResponse("This owner has no effective property interest on the paid date.", 422);
    if (code.includes("OWNER_STATEMENT_NOT_FOUND") || code.includes("OWNER_REMITTANCE_CONTEXT_NOT_FOUND")) return errorResponse("The owner, property, or statement was not found.", 404);
    return errorResponse("The remittance could not be recorded. No financial rows were committed.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}
