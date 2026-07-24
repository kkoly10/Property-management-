import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitPrivacyRequestSchema } from "@/lib/validation/privacy";

const errorResponse = (code: string, message: string, status: number) =>
  NextResponse.json({ code, error: message }, { status });

export async function POST(request: Request) {
  const parsed = submitPrivacyRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the privacy request.", 400);
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return errorResponse("INVALID_IDEMPOTENCY_KEY", "Use an idempotency key between 8 and 200 characters.", 400);
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return errorResponse("AUTHENTICATION_REQUIRED", "Sign in to submit a privacy request.", 401);
  }

  const input = parsed.data;
  const { data, error } = await supabase.rpc("submit_privacy_request", {
    p_organization_id: input.organizationId,
    p_request_type: input.requestType,
    p_jurisdiction_code: input.jurisdictionCode,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("ORGANIZATION_SCOPE_DENIED")) {
      return errorResponse("FORBIDDEN", "That organization is not available to your account.", 403);
    }
    if (code.includes("JURISDICTION_ORGANIZATION_MISMATCH")) {
      return errorResponse("JURISDICTION_MISMATCH", "The jurisdiction must match the selected organization.", 422);
    }
    if (code.includes("IDEMPOTENCY_CONFLICT")) {
      return errorResponse("IDEMPOTENCY_CONFLICT", "This retry no longer matches the original privacy request.", 409);
    }
    return errorResponse("REQUEST_FAILED", "The privacy request could not be submitted.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}
