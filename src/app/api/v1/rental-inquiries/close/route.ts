import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationContext } from "@/lib/organization/context";
import { closeRentalInquirySchema } from "@/lib/validation/rental-inquiry";

const reply = (body: unknown, status: number) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request) {
  const parsed = closeRentalInquirySchema.safeParse(await request.json().catch(() => null));
  const operationKey = request.headers.get("idempotency-key");
  if (!parsed.success || !operationKey || operationKey.length < 8 || operationKey.length > 200) {
    return reply({ error: "Check the inquiry request." }, 400);
  }

  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== parsed.data.organizationId) {
    return reply({ error: "Your selected workspace changed. Return to My rentals before continuing." }, 409);
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return reply({ error: "Sign in to manage inquiries." }, 401);

  const { data, error } = await supabase.rpc("close_rental_inquiry", {
    p_organization_id: parsed.data.organizationId,
    p_inquiry_id: parsed.data.inquiryId,
    p_expected_version: parsed.data.expectedVersion,
    p_idempotency_key: operationKey,
  });
  if (error || !data) {
    const message = error?.message ?? "";
    if (error?.code === "42501") return reply({ error: "This inquiry is outside your rental scope." }, 403);
    if (message.includes("INQUIRY_VERSION_CONFLICT")) {
      return reply({ error: "This inquiry changed elsewhere. Reload before closing it." }, 409);
    }
    if (message.includes("IDEMPOTENCY_CONFLICT")) {
      return reply({ error: "This close operation key was already used for a different request." }, 409);
    }
    if (message.includes("INQUIRY_NOT_OPEN")) return reply({ error: "This inquiry is already closed." }, 422);
    if (message.includes("INQUIRY_NOT_FOUND") || error?.code === "P0002") return reply({ error: "Inquiry not found." }, 404);
    return reply({ error: "The close result could not be confirmed. Retry the same operation." }, 502);
  }
  return reply(data, 200);
}
