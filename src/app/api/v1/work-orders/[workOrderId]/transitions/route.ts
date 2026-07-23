import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transitionWorkOrderSchema } from "@/lib/validation/maintenance";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ workOrderId: string }> }) {
  const { workOrderId } = await params;
  const parsed = transitionWorkOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the work order update.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to update this work order.", 401);

  const transition = parsed.data;
  const { data, error } = await supabase.rpc("transition_work_order", {
    p_work_order_id: workOrderId,
    p_expected_version: transition.expectedVersion,
    p_transition: transition.transition,
    p_reason: transition.reason ?? null,
    p_scheduled_start: transition.scheduledStart ?? null,
    p_scheduled_end: transition.scheduledEnd ?? null,
    p_actual_cost_minor: transition.actualCostMinor ?? null,
    p_completion_summary: transition.completionSummary ?? null,
    p_evidence_document_ids: transition.evidenceDocumentIds ?? [],
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("PROPERTY_SCOPE_DENIED")) return errorResponse("You do not have maintenance access for this property.", 403);
    if (code.includes("WORK_ORDER_NOT_FOUND")) return errorResponse("That work order was not found.", 404);
    if (code.includes("WORK_ORDER_VERSION_CONFLICT")) return errorResponse("This work order changed since you opened it. Refresh and try again.", 409);
    if (code.includes("WORK_ORDER_ALREADY_CLOSED") || code.includes("INVALID_TRANSITION")) return errorResponse("That update is not valid for the work order's current status.", 422);
    if (code.includes("COMPLETION_EVIDENCE_REQUIRED")) return errorResponse("Attach completion evidence before marking this work order complete.", 422);
    if (code.includes("COMPLETION_SUMMARY_REQUIRED")) return errorResponse("Describe the completed work.", 422);
    if (code.includes("EVIDENCE_NOT_AVAILABLE")) return errorResponse("One or more evidence files are unavailable. Remove them and try again.", 422);
    if (code.includes("CANCEL_REASON_REQUIRED")) return errorResponse("Explain why the work order is being canceled.", 422);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original update.", 409);
    return errorResponse("The work order could not be updated.", 422);
  }
  return NextResponse.json(data, { status: 200 });
}
