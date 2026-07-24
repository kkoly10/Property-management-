import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finalizeOwnerStatementSchema } from "@/lib/validation/owner-statements";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const parsed = finalizeOwnerStatementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the statement details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to finalize an owner statement.", 401);
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) return errorResponse("An idempotency key is required to finalize a statement.", 400);

  const statement = parsed.data;
  const { data, error } = await supabase.rpc("finalize_owner_statement", {
    p_organization_id: statement.organizationId,
    p_accounting_book_id: statement.accountingBookId,
    p_owner_entity_id: statement.ownerEntityId,
    p_property_id: statement.propertyId,
    p_period_start: statement.periodStart,
    p_period_end: statement.periodEnd,
    p_expected_calculation_hash: statement.expectedCalculationHash,
    p_idempotency_key: idempotencyKey,
    p_correction_reason: statement.correctionReason ?? null,
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("OWNER_STATEMENT_SCOPE_DENIED")) return errorResponse("You need owner and finance management access for this property.", 403);
    if (code.includes("OWNER_STATEMENT_PLAN_UNAVAILABLE")) return errorResponse("Owner statements require an active Growth or Pro plan.", 403);
    if (code.includes("OWNER_STATEMENT_CALCULATION_CHANGED")) return errorResponse("The ledger changed after this calculation. Recalculate before finalizing.", 409);
    if (code.includes("OWNER_STATEMENT_ALREADY_FINALIZED")) return errorResponse("This exact calculation is already finalized.", 409);
    if (code.includes("OWNER_STATEMENT_CORRECTION_REASON_REQUIRED")) return errorResponse("Explain why this corrected statement is being issued.", 422);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original statement.", 409);
    if (code.includes("OWNER_INTEREST_NOT_EFFECTIVE")) return errorResponse("This owner has no effective interest during the selected period.", 422);
    if (code.includes("OWNERSHIP_ALLOCATION_INCOMPLETE")) return errorResponse("Ownership fractions are incomplete or overlap on a posted ledger date.", 422);
    if (code.includes("OWNER_STATEMENT_CONTEXT_NOT_FOUND")) return errorResponse("The owner, property, or accounting book was not found.", 404);
    return errorResponse("The owner statement could not be finalized.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}
