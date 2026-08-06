import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordWorkOrderCostSchema } from "@/lib/validation/maintenance";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ workOrderId: string }> }) {
  const { workOrderId } = await params;
  const parsed = recordWorkOrderCostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the work order cost.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to record this cost.", 401);

  const cost = parsed.data;
  const { data, error } = await supabase.rpc("record_work_order_cost", {
    p_organization_id: cost.organizationId,
    p_work_order_id: workOrderId,
    p_amount_minor: cost.amountMinor,
    p_currency_code: cost.currencyCode,
    p_memo: cost.memo ?? null,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("PROPERTY_SCOPE_DENIED")) return errorResponse("You do not have finance access for this property.", 403);
    if (code.includes("WORK_ORDER_NOT_FOUND")) return errorResponse("That work order was not found.", 404);
    if (code.includes("WORK_ORDER_COST_ALREADY_POSTED")) return errorResponse("This work order's cost has already been posted.", 409);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original cost.", 409);
    if (code.includes("COMMAND_IN_PROGRESS")) return errorResponse("This cost is already being posted. Try again in a moment.", 409);
    if (code.includes("WORK_ORDER_NOT_COMPLETED")) return errorResponse("Complete or close the work order before posting its cost.", 422);
    if (code.includes("WORK_ORDER_COST_CURRENCY_MISMATCH")) return errorResponse("The cost currency must match the property's accounting book.", 422);
    if (code.includes("ACCOUNTING_BOOK_NOT_OPEN")) return errorResponse("This property's accounting book is not open for posting.", 422);
    if (code.includes("INVALID_COST_AMOUNT")) return errorResponse("Enter a cost amount greater than zero.", 422);
    if (code.includes("LEDGER_ACCOUNT_CONFLICT")) return errorResponse("The maintenance ledger accounts are misconfigured for this property.", 422);
    return errorResponse("The work order cost could not be recorded.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}
