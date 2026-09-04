import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOwnerEntitySchema } from "@/lib/validation/owners";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const parsed = createOwnerEntitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the owner details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to add an owner.", 401);

  const owner = parsed.data;
  const { data, error } = await supabase.rpc("create_owner_entity", {
    p_organization_id: owner.organizationId,
    p_display_name: owner.displayName,
    p_entity_type: owner.entityType,
    p_email: owner.email ?? null,
    p_phone_e164: owner.phoneE164 ?? null,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("OWNER_SCOPE_DENIED")) return errorResponse("You do not have organization-wide owner access.", 403);
    if (code.includes("OWNER_PLAN_UNAVAILABLE")) return errorResponse("This plan does not include the owner portal.", 403);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original owner.", 409);
    if (code.includes("INVALID_OWNER")) return errorResponse("Check the owner details.", 422);
    return errorResponse("The owner could not be added.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}
