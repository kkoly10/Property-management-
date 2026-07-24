import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAnnouncementSchema } from "@/lib/validation/announcements";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const parsed = createAnnouncementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the announcement.", 400);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8) return errorResponse("A valid idempotency key is required.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to create an announcement.", 401);
  const input = parsed.data;
  const { data, error } = await supabase.rpc("create_announcement", {
    p_organization_id: input.organizationId,
    p_property_id: input.propertyId,
    p_title: input.title,
    p_body_text: input.bodyText,
    p_locale: input.locale,
    p_audience_type: input.audienceType,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("PROPERTY_SCOPE_DENIED") || code.includes("ORGANIZATION_SCOPE_DENIED")) return errorResponse("You cannot publish to that audience.", 403);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original announcement.", 409);
    return errorResponse("The announcement draft could not be created.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}
