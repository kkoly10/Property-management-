import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/lib/organization/context";
import { homeownerRentalSchema, rentalOperationKeySchema } from "@/lib/validation/homeowner-rental";

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});
export async function POST(request: Request) {
  const parsed = homeownerRentalSchema.safeParse(await request.json().catch(() => null));
  const key = rentalOperationKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!parsed.success || !key.success) return reply({ error: "Check the rental details and operation key." }, 400);
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Sign in to create your rental." }, 401);
  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== parsed.data.organizationId) {
    return reply({ error: "Your selected workspace changed. Return to My rentals before continuing." }, 409);
  }
  if (context.active.customerPath !== "self_managing") return reply({ error: "Use the self-managing workspace for this setup." }, 403);
  const { data, error } = await supabase.rpc("create_homeowner_rental", {
    p_organization_id: parsed.data.organizationId,
    p_details: { property: parsed.data.property, space: parsed.data.space },
    p_idempotency_key: key.data,
  });
  if (error || !data) {
    const message = error?.message ?? "";
    if (error?.code === "42501") return reply({ error: "This property or rental account is unavailable to your workspace." }, 403);
    if (message.includes("IDEMPOTENCY_CONFLICT")) return reply({ error: "This operation was already submitted with different details. Check My rentals before starting another." }, 409);
    if (message.includes("COMMAND_IN_PROGRESS")) return reply({ error: "Your rental is still being created. Retry the same request." }, 503);
    if (message.includes("PLAN_LIMIT_EXCEEDED")) return reply({ error: "Your plan cannot add another active rental. No setup records were created." }, 422);
    if (message.includes("PLAN_UNAVAILABLE")) return reply({ error: "A rental plan is required. Check your subscription before retrying." }, 422);
    if (["22023", "22P02", "23514"].includes(error?.code ?? "")) return reply({ error: "Check the address, time zone, ownership details, and room counts. Nothing was created." }, 422);
    if (error?.code === "23505") return reply({ error: "A rental or operator record already uses that name. Select the existing property or rental account; nothing was added." }, 422);
    return reply({ error: "The result could not be confirmed. Retry with the same details or check My rentals." }, 502);
  }
  return reply(data, 201);
}
