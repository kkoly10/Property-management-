import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendConversationMessageSchema } from "@/lib/validation/messaging";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const parsed = sendConversationMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Check the message.", 400);

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8) return errorResponse("A valid idempotency key is required.", 400);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to send a message.", 401);

  const { conversationId } = await params;
  const { data, error } = await supabase.rpc("send_conversation_message", {
    p_conversation_id: conversationId,
    p_body_text: parsed.data.bodyText,
    p_idempotency_key: idempotencyKey,
  });
  if (error || !data) {
    const code = error?.message ?? "";
    if (code.includes("CONVERSATION_NOT_FOUND")) return errorResponse("Conversation not found.", 404);
    if (code.includes("CONVERSATION_NOT_OPEN")) return errorResponse("This conversation is closed.", 409);
    if (code.includes("IDEMPOTENCY_CONFLICT")) return errorResponse("This retry no longer matches the original message.", 409);
    if (code.includes("INVALID_MESSAGE_BODY")) return errorResponse("Check the message and try again.", 400);
    return errorResponse("The message could not be sent.", 422);
  }
  return NextResponse.json(data, { status: 201 });
}

