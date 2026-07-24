import { NextResponse } from "next/server";
import { getNotificationPreferencesWorkspace } from "@/lib/data/notification-preferences";
import { createClient } from "@/lib/supabase/server";
import { updateNotificationPreferencesSchema } from "@/lib/validation/notification-preferences";

const errorResponse = (code: string, message: string, status: number) =>
  NextResponse.json({ code, error: message }, { status });

export async function GET() {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return errorResponse("AUTHENTICATION_REQUIRED", "Sign in to view notification preferences.", 401);
  const workspace = await getNotificationPreferencesWorkspace();
  if (workspace.mode !== "ready") return errorResponse("PREFERENCES_UNAVAILABLE", "Notification preferences are temporarily unavailable.", 503);
  return NextResponse.json(workspace);
}

export async function PUT(request: Request) {
  const parsed = updateNotificationPreferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Check the notification preferences.", 400);
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return errorResponse("INVALID_IDEMPOTENCY_KEY", "Use an idempotency key between 8 and 200 characters.", 400);
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("AUTHENTICATION_REQUIRED", "Sign in to update notification preferences.", 401);

  const input = parsed.data;
  const { data, error } = await supabase.rpc("update_notification_preferences", {
    p_locale: input.locale,
    p_reduce_motion: input.reduceMotion,
    p_high_contrast: input.highContrast,
    p_text_scale: input.textScale,
    p_channels: input.channels,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    const message = error?.message ?? "";
    if (message.includes("PREFERENCES_VERSION_CONFLICT")) {
      return errorResponse("VERSION_CONFLICT", "These preferences changed. Refresh and try again.", 409);
    }
    if (message.includes("PHONE_REQUIRED")) {
      return errorResponse("PHONE_REQUIRED", "Add a phone number before enabling SMS or WhatsApp.", 422);
    }
    if (message.includes("IDEMPOTENCY_CONFLICT")) {
      return errorResponse("IDEMPOTENCY_CONFLICT", "This retry no longer matches the original preferences.", 409);
    }
    return errorResponse("PREFERENCES_UPDATE_FAILED", "The notification preferences could not be saved.", 422);
  }
  return NextResponse.json(data);
}

