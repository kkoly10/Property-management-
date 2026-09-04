import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOwnershipInterestSchema } from "@/lib/validation/owners";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const parsed = createOwnershipInterestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the ownership details.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to add an ownership interest.", 401);

  const interest = parsed.data;
  const { data, error } = await supabase.rpc("create_ownership_interest", {
    p_organization_id: interest.organizationId,
    p_property_id: interest.propertyId,
    p_owner_entity_id: interest.ownerEntityId,
    p_ownership_fraction: interest.ownershipFraction,
    p_effective_from: interest.effectiveFrom,
    p_effective_to: interest.effectiveTo ?? null,
    p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("OWNERSHIP_INTEREST_SCOPE_DENIED")) return errorResponse("You do not have owner access to this property.", 403);
    if (code.includes("OWNER_PLAN_UNAVAILABLE")) return errorResponse("This plan does not include the owner portal.", 403);
    if (code.includes("PROPERTY_NOT_FOUND")) return errorResponse("That property was not found.", 404);
    if (code.includes("OWNER_ENTITY_NOT_FOUND")) return errorResponse("That owner was not found.", 404);
    if (code.includes("OWNER_ENTITY_INACTIVE")) return errorResponse("That owner is not active.", 422);
    if (code.includes("OWNERSHIP_INTEREST_OVERLAP")) return errorResponse("This owner already has an overlapping interest on this property.", 422);
    if (code.includes("INVALID_OWNERSHIP_FRACTION")) return errorResponse("Enter a share greater than 0 and up to 100%.", 422);
    if (code.includes("INVALID_EFFECTIVE")) return errorResponse("Check the effective dates.", 422);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original interest.", 409);
    return errorResponse("The ownership interest could not be added.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}
