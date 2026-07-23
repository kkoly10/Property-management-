import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAndAssignWorkOrderSchema } from "@/lib/validation/maintenance";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const parsed = createAndAssignWorkOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the work order details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to create a work order.", 401);

  const workOrder = parsed.data;
  const { data, error } = await supabase.rpc("create_and_assign_work_order", {
    p_organization_id: workOrder.organizationId,
    p_maintenance_request_id: workOrder.maintenanceRequestId,
    p_vendor_id: workOrder.vendorId ?? null,
    p_scope: workOrder.scope,
    p_scheduled_start: workOrder.scheduledStart ?? null,
    p_scheduled_end: workOrder.scheduledEnd ?? null,
    p_estimated_cost_minor: workOrder.estimatedCostMinor ?? null,
    p_currency_code: workOrder.currencyCode ?? null,
    p_owner_approval_required: workOrder.ownerApprovalRequired,
    p_official_priority: workOrder.officialPriority ?? null,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("PROPERTY_SCOPE_DENIED")) return errorResponse("You do not have maintenance access for this property.", 403);
    if (code.includes("MAINTENANCE_REQUEST_NOT_FOUND")) return errorResponse("That maintenance request was not found.", 404);
    if (code.includes("MAINTENANCE_REQUEST_NOT_ELIGIBLE")) return errorResponse("This request already has an active work order or is closed.", 422);
    if (code.includes("WORK_ORDER_ALREADY_EXISTS")) return errorResponse("This request already has an active work order.", 409);
    if (code.includes("VENDOR_NOT_FOUND")) return errorResponse("The selected vendor is unavailable.", 422);
    if (code.includes("WORK_ORDER_CURRENCY_MISMATCH")) return errorResponse("The estimated cost currency must match the property's accounting book.", 422);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original work order.", 409);
    return errorResponse("The work order could not be created.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}
