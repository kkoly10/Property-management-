import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { workOrderCostApprovalSchema } from "@/lib/validation/maintenance";

export async function POST(request: Request, { params }: { params: Promise<{ workOrderId: string }> }) {
  const { workOrderId } = await params;
  const parsed = workOrderCostApprovalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in to request owner approval." }, { status: 401 });
  const input = parsed.data;
  const { data, error } = await supabase.rpc("request_work_order_cost_approval", {
    p_organization_id: input.organizationId,
    p_work_order_id: workOrderId,
    p_amount_minor: input.amountMinor ?? null,
    p_currency_code: input.currencyCode,
    p_expected_version: input.expectedVersion,
    p_note: input.memo ?? null,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });
  if (!error && data) return NextResponse.json(data);

  const code = error?.message ?? "";
  if (code.includes("PROPERTY_SCOPE_DENIED")) return NextResponse.json({ error: "You do not have approval request access for this property." }, { status: 403 });
  if (code.includes("WORK_ORDER_NOT_FOUND")) return NextResponse.json({ error: "That work order was not found." }, { status: 404 });
  if (code.includes("WORK_ORDER_VERSION_CONFLICT") || code.includes("IDEMPOTENCY_CONFLICT") || code.includes("COMMAND_IN_PROGRESS")) {
    return NextResponse.json({ error: "The cost review changed. Refresh and try again." }, { status: 409 });
  }
  if (code.includes("OWNER_APPROVER_NOT_CONFIGURED")) return NextResponse.json({ error: "Add an active owner interest for this property and request approval again." }, { status: 422 });
  if (code.includes("WORK_ORDER_COST_CURRENCY_MISMATCH")) return NextResponse.json({ error: "The currency must match the property's accounting book." }, { status: 422 });
  if (code.includes("WORK_ORDER_COST_APPROVAL_NOT_REQUIRED")) return NextResponse.json({ error: "This amount can be posted without owner approval." }, { status: 422 });
  if (code.includes("WORK_ORDER_COST_ALREADY_POSTED")) return NextResponse.json({ error: "This work order's cost has already been posted." }, { status: 409 });
  if (code.includes("WORK_ORDER_COST_REVIEW_UNAVAILABLE")) return NextResponse.json({ error: "This work order is outside the cost approval stage." }, { status: 422 });
  if (code.includes("INVALID_COST_AMOUNT")) return NextResponse.json({ error: "Enter a valid approval amount." }, { status: 422 });
  return NextResponse.json({ error: "Retry to confirm whether the owner approval was requested." }, { status: 502 });
}
