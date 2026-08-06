import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveReconciliationExceptionSchema } from "@/lib/validation/finance";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ exceptionId: string }> }) {
  const { exceptionId } = await params;
  const parsed = resolveReconciliationExceptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the resolution details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to resolve this exception.", 401);

  const resolution = parsed.data;
  const { data, error } = await supabase.rpc("resolve_reconciliation_exception", {
    p_organization_id: resolution.organizationId,
    p_reconciliation_exception_id: exceptionId,
    p_resolution: resolution.resolution,
    p_evidence: resolution.evidence ?? null,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });

  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("FINANCE_SCOPE_DENIED")) return errorResponse("You do not have finance access for this organization.", 403);
    if (code.includes("RECONCILIATION_EXCEPTION_NOT_FOUND")) return errorResponse("That reconciliation exception was not found.", 404);
    if (code.includes("EXCEPTION_ALREADY_RESOLVED")) return errorResponse("This exception has already been resolved or waived.", 409);
    if (code.includes("EXCEPTION_ALREADY_ESCALATED")) return errorResponse("This exception is already escalated.", 409);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original resolution.", 409);
    if (code.includes("COMMAND_IN_PROGRESS")) return errorResponse("This exception is already being resolved. Try again in a moment.", 409);
    if (code.includes("RESOLUTION_EVIDENCE_REQUIRED")) return errorResponse("Record an evidence note when resolving or waiving an exception.", 422);
    if (code.includes("RESOLUTION_EVIDENCE_INVALID")) return errorResponse("The evidence note must be between 8 and 1000 characters.", 422);
    if (code.includes("INVALID_RESOLUTION")) return errorResponse("Choose resolve, waive, or escalate.", 422);
    return errorResponse("The exception could not be resolved.", 422);
  }

  return NextResponse.json(data);
}
