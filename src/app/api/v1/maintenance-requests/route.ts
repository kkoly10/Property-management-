import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitMaintenanceRequestSchema } from "@/lib/validation/maintenance";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const parsed = submitMaintenanceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the maintenance request.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to submit a maintenance request.", 401);

  const input = parsed.data;
  const { data, error } = await supabase.rpc("submit_maintenance_request", {
    p_tenancy_id: input.tenancyId,
    p_category: input.category,
    p_title: input.title,
    p_description: input.description,
    p_priority_requested: input.priorityRequested ?? null,
    p_access_permission: input.accessPermission ?? null,
    p_preferred_times: input.preferredTimes,
    p_evidence_document_ids: input.evidenceDocumentIds,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("TENANCY_SCOPE_DENIED")) return errorResponse("You cannot submit a request for that home.", 403);
    if (code.includes("MAINTENANCE_RATE_LIMITED")) return errorResponse("You have submitted several requests today. Contact management if this is urgent.", 429);
    if (code.includes("EVIDENCE_NOT_AVAILABLE")) return errorResponse("One or more photos are unavailable. Remove them and try again.", 422);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original request.", 409);
    return errorResponse("The maintenance request could not be submitted.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}
