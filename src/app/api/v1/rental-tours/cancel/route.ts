import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrganizationContext } from "@/lib/organization/context";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ organizationId: z.uuid(), tourRequestId: z.uuid(), expectedVersion: z.number().int().positive() }).strict();
const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const key = request.headers.get("idempotency-key");
  if (!parsed.success || !key || key.length < 8 || key.length > 200) {
    return reply({ error: "Check the cancellation request." }, 400);
  }
  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== parsed.data.organizationId) {
    return reply({ error: "Your selected workspace changed. Return to My rentals before continuing." }, 409);
  }
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Sign in to manage tours." }, 401);

  const { data, error } = await supabase.rpc("cancel_rental_tour", {
    p_organization_id: parsed.data.organizationId, p_tour_request_id: parsed.data.tourRequestId,
    p_expected_version: parsed.data.expectedVersion, p_idempotency_key: key,
  });
  if (error?.code === "42501") return reply({ error: "This tour is outside your rental scope." }, 403);
  if (error?.code === "P0002") return reply({ error: "Tour request not found." }, 404);
  if (error?.code === "40001" || error?.code === "23505" || error?.code === "23514") {
    return reply({ error: "This tour changed or can no longer be canceled. Reload to see its status." }, 409);
  }
  if (error || !data) return reply({ error: "The cancellation could not be confirmed. Retry the same cancellation." }, 502);
  return reply(data, 200);
}
