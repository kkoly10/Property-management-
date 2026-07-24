import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cancelAnnouncementSchema } from "@/lib/validation/announcements";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ announcementId: string }> }) {
  const parsed = cancelAnnouncementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the announcement version.", 400);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8) return errorResponse("A valid idempotency key is required.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to cancel an announcement.", 401);
  const { announcementId } = await params;
  const { data, error } = await supabase.rpc("cancel_announcement", {
    p_announcement_id: announcementId,
    p_expected_version: parsed.data.expectedVersion,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("ANNOUNCEMENT_NOT_FOUND")) return errorResponse("Announcement not found.", 404);
    if (code.includes("ANNOUNCEMENT_VERSION_CONFLICT") || code.includes("ANNOUNCEMENT_NOT_CANCELABLE") || code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("The announcement changed. Refresh before canceling.", 409);
    return errorResponse("The announcement could not be canceled.", 422);
  }
  return NextResponse.json(data);
}
