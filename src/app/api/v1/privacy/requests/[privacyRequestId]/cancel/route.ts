import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cancelPrivacyRequestSchema } from "@/lib/validation/privacy";

const errorResponse = (code: string, message: string, status: number) =>
  NextResponse.json({ code, error: message }, { status });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ privacyRequestId: string }> },
) {
  const parsed = cancelPrivacyRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the cancellation.", 400);
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return errorResponse("INVALID_IDEMPOTENCY_KEY", "Use an idempotency key between 8 and 200 characters.", 400);
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return errorResponse("AUTHENTICATION_REQUIRED", "Sign in to cancel this privacy request.", 401);
  }

  const { privacyRequestId } = await params;
  const { data, error } = await supabase.rpc("cancel_privacy_request", {
    p_privacy_request_id: privacyRequestId,
    p_expected_version: parsed.data.expectedVersion,
    p_reason: parsed.data.reason,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("PRIVACY_REQUEST_NOT_FOUND")) {
      return errorResponse("NOT_FOUND", "That privacy request was not found.", 404);
    }
    if (code.includes("VERSION_CONFLICT") || code.includes("PRIVACY_REQUEST_NOT_CANCELABLE")) {
      return errorResponse("CONFLICT", "This privacy request changed and cannot be canceled from this view.", 409);
    }
    if (code.includes("IDEMPOTENCY_CONFLICT")) {
      return errorResponse("IDEMPOTENCY_CONFLICT", "This retry no longer matches the original cancellation.", 409);
    }
    return errorResponse("REQUEST_FAILED", "The privacy request could not be canceled.", 422);
  }
  return NextResponse.json(data);
}
