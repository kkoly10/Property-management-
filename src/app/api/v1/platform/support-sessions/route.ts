import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { startSupportSessionSchema } from "@/lib/validation/platform-support";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const parsed = startSupportSessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the support-session details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to open a support session.", 401);

  const input = parsed.data;
  const { data, error } = await supabase.rpc("start_support_session", {
    p_organization_id: input.organizationId,
    p_reason: input.reason,
    p_ttl_minutes: input.ttlMinutes,
    p_idempotency_key: request.headers.get("idempotency-key") ?? input.idempotencyKey,
  });

  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("MFA_STEP_UP_REQUIRED")) return errorResponse("Multi-factor step-up is required before opening a support session.", 403);
    if (code.includes("NOT_PLATFORM_ACTOR")) return errorResponse("Your account is not a platform support actor.", 403);
    if (code.includes("ORGANIZATION_NOT_FOUND")) return errorResponse("That organization was not found.", 404);
    if (code.includes("AUDIT_REASON_REQUIRED") || code.includes("INVALID_SUPPORT_REASON")) return errorResponse("Enter a support reason of 8–500 characters.", 422);
    if (code.includes("INVALID_SUPPORT_TTL")) return errorResponse("Choose a session length between 5 and 240 minutes.", 422);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original request.", 409);
    if (code.includes("COMMAND_IN_PROGRESS")) return errorResponse("This session is already being opened. Try again in a moment.", 409);
    return errorResponse("The support session could not be opened.", 422);
  }

  return NextResponse.json(data, { status: 201 });
}
