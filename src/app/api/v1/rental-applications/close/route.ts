import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/lib/organization/context";
import { closeRentalApplicationSchema } from "@/lib/validation/rental-application";

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request) {
  const parsed = closeRentalApplicationSchema.safeParse(await request.json().catch(() => null));
  const key = request.headers.get("idempotency-key");
  if (!parsed.success || !key || key.length < 8 || key.length > 200) {
    return reply({ error: "Check the application close request." }, 400);
  }
  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== parsed.data.organizationId) {
    return reply({ error: "Your selected workspace changed. Return to My rentals." }, 409);
  }
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Sign in to close an application." }, 401);
  const { data, error } = await supabase.rpc("close_rental_application", {
    p_organization_id: parsed.data.organizationId,
    p_application_id: parsed.data.applicationId,
    p_expected_version: parsed.data.expectedVersion,
    p_idempotency_key: key,
  });
  if (error || !data) {
    const message = error?.message ?? "";
    if (error?.code === "42501") return reply({ error: "This application is outside your scope." }, 403);
    if (message.includes("APPLICATION_VERSION_CONFLICT")) return reply({ error: "Application changed. Reload and try again." }, 409);
    if (message.includes("APPLICATION_NOT_CLOSABLE")) return reply({ error: "This application can no longer be closed." }, 409);
    if (message.includes("IDEMPOTENCY_CONFLICT")) return reply({ error: "This operation key has already been used." }, 409);
    if (error?.code === "P0002") return reply({ error: "Application not found." }, 404);
    return reply({ error: "Close result could not be confirmed. Retry the same operation." }, 502);
  }
  return reply(data, 200);
}
