import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ownerApprovalDecisionSchema } from "@/lib/validation/maintenance";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ approvalId: string }> }) {
  const { approvalId } = await params;
  const parsed = ownerApprovalDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the approval decision.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to respond to this approval.", 401);

  const approval = parsed.data;
  const { data, error } = await supabase.rpc("respond_to_owner_approval", {
    p_approval_request_id: approvalId,
    p_decision: approval.decision,
    p_reason: approval.reason ?? null,
    p_expected_version: approval.expectedVersion,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("OWNER_APPROVAL_SCOPE_DENIED")) return errorResponse("This approval is not assigned to your owner entity.", 403);
    if (code.includes("MFA_STEP_UP_REQUIRED")) return errorResponse("Verify your identity with multi-factor authentication before deciding this high-value request.", 403);
    if (code.includes("OWNER_APPROVAL_NOT_FOUND")) return errorResponse("That approval request was not found.", 404);
    if (code.includes("VERSION_CONFLICT") || code.includes("OWNER_APPROVAL_ALREADY_DECIDED")) return errorResponse("This request changed since you opened it. Refresh to see the recorded decision.", 409);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original decision.", 409);
    return errorResponse("The approval decision could not be recorded.", 422);
  }
  return NextResponse.json(data, { status: 200 });
}
