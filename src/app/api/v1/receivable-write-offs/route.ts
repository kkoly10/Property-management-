import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeOffReceivableSchema } from "@/lib/validation/finance";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const parsed = writeOffReceivableSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the write-off details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to write off a receivable.", 401);

  const writeOff = parsed.data;
  const { data, error } = await supabase.rpc("write_off_receivable", {
    p_organization_id: writeOff.organizationId,
    p_tenancy_id: writeOff.tenancyId,
    p_charge_ids: writeOff.chargeIds,
    p_reason: writeOff.reason,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });

  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("PROPERTY_SCOPE_DENIED")) return errorResponse("You do not have finance access for this property.", 403);
    if (code.includes("TENANCY_NOT_FOUND")) return errorResponse("That tenancy was not found.", 404);
    if (code.includes("WRITE_OFF_CHARGE_NOT_AVAILABLE")) return errorResponse("One or more charges are already settled or written off. Refresh and try again.", 409);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original write-off.", 409);
    if (code.includes("COMMAND_IN_PROGRESS")) return errorResponse("This write-off is already being posted. Try again in a moment.", 409);
    if (code.includes("ACCOUNTING_BOOK_NOT_OPEN")) return errorResponse("This property's accounting book is not open for posting.", 422);
    if (code.includes("RECEIVABLE_ACCOUNT_NOT_ACTIVE")) return errorResponse("This tenancy's receivable account is not active.", 422);
    if (code.includes("WRITE_OFF_AMOUNT_INVALID")) return errorResponse("The selected charges have no outstanding balance to write off.", 422);
    if (code.includes("LEDGER_ACCOUNT_CONFLICT")) return errorResponse("The write-off ledger accounts are misconfigured for this property.", 422);
    return errorResponse("The receivable could not be written off. No financial rows were committed.", 422);
  }

  return NextResponse.json(data, { status: 201 });
}
