import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { endSupportSessionSchema } from "@/lib/validation/platform-support";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const parsed = endSupportSessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the request.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to end a support session.", 401);

  const input = parsed.data;
  const { data, error } = await supabase.rpc("end_support_session", {
    p_organization_id: input.organizationId,
    p_support_session_id: sessionId,
    p_disposition: input.disposition,
    p_idempotency_key: request.headers.get("idempotency-key") ?? input.idempotencyKey,
  });

  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("NOT_PLATFORM_ACTOR")) return errorResponse("Your account is not a platform support actor.", 403);
    if (code.includes("SUPPORT_SESSION_FORBIDDEN")) return errorResponse("You cannot end another actor's support session.", 403);
    if (code.includes("SUPPORT_SESSION_NOT_FOUND")) return errorResponse("That support session was not found.", 404);
    if (code.includes("SUPPORT_SESSION_NOT_ACTIVE")) return errorResponse("That support session is already closed.", 422);
    if (code.includes("INVALID_SUPPORT_DISPOSITION")) return errorResponse("Choose how to close the session.", 422);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original request.", 409);
    if (code.includes("COMMAND_IN_PROGRESS")) return errorResponse("This session is already being closed. Try again in a moment.", 409);
    return errorResponse("The support session could not be ended.", 422);
  }

  return NextResponse.json(data, { status: 200 });
}
