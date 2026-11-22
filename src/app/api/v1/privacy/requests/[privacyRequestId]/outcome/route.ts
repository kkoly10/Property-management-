import { NextResponse } from "next/server";
import { z } from "zod";
import { getActiveOrganizationId } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";
import { recordPrivacyOutcomeSchema } from "@/lib/validation/privacy";

function errorResponse(code: string, error: string, status: number) {
  return NextResponse.json({ code, error }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ privacyRequestId: string }> },
) {
  const { privacyRequestId } = await params;
  if (!z.uuid().safeParse(privacyRequestId).success) return errorResponse("NOT_FOUND", "That privacy request was not found.", 404);
  const parsed = recordPrivacyOutcomeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the outcome details.", 400);
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length < 8 || key.length > 200) return errorResponse("INVALID_IDEMPOTENCY_KEY", "Use an idempotency key between 8 and 200 characters.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("AUTHENTICATION_REQUIRED", "Sign in to record a privacy outcome.", 401);
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) return errorResponse("NOT_FOUND", "Select the workspace for this request.", 404);
  const { data, error } = await supabase.rpc("record_operator_privacy_outcome", {
    p_organization_id: organizationId,
    p_privacy_request_id: privacyRequestId,
    p_expected_version: parsed.data.expectedVersion,
    p_outcome: parsed.data.outcome,
    p_requester_message: parsed.data.requesterMessage,
    p_review_reference: parsed.data.reviewReference,
    p_idempotency_key: key,
  });
  const code = error?.message;
  if (code === "PRIVACY_REQUEST_NOT_FOUND" || code === "ORGANIZATION_SCOPE_DENIED") {
    return errorResponse("NOT_FOUND", "That privacy request was not found in the selected workspace.", 404);
  }
  if (code === "MFA_STEP_UP_REQUIRED") return errorResponse(code, "Verify with your authenticator before recording an outcome.", 403);
  if (code === "PRIVACY_FULL_FULFILLMENT_UNAVAILABLE") return errorResponse(code, "Full fulfillment is unavailable for this request.", 409);
  if (code === "PRIVACY_COMMAND_IN_PROGRESS" || code === "COMMAND_IN_PROGRESS") {
    return errorResponse("COMMAND_IN_PROGRESS", "The request is being processed. Try again shortly.", 409);
  }
  if (code === "VERSION_CONFLICT" || code === "PRIVACY_REQUEST_NOT_ACTIONABLE" || code === "IDEMPOTENCY_CONFLICT") {
    return errorResponse(code, "Refresh the request before recording another outcome.", 409);
  }
  if (error || !data) return errorResponse("REQUEST_UNCONFIRMED", "Retry to confirm whether your update was recorded.", 502);
  return NextResponse.json(data);
}
