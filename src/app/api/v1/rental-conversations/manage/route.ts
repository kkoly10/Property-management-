import { NextResponse } from "next/server";
import { z } from "zod";
import { scheduleCriticalRentalMail } from "@/lib/notifications/rental-fast-mail";
import { getOrganizationContext } from "@/lib/organization/context";
import { conversationKind, conversationState, conversationMessageInput } from "@/lib/rental-conversation";
import { createClient } from "@/lib/supabase/server";

const scopeSchema = z.object({ organizationId: z.uuid(), kind: conversationKind, id: z.uuid() }).strict();
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

async function conversation(input: z.infer<typeof scopeSchema>, message?: z.infer<typeof conversationMessageInput>) {
  const context = await getOrganizationContext();
  if (context.state !== "active" || context.active.organizationId !== input.organizationId) {
    return reply({ error: "Return to the rental in your active workspace." }, 409);
  }
  const client = await createClient();
  const { data, error } = await client.rpc("manage_rental_conversation", {
    p_org: input.organizationId, p_kind: input.kind, p_id: input.id,
    ...(message ? { p_body: message.body, p_operation: message.operation } : {}),
  });
  if (error?.code === "42501") return reply({ error: "This conversation is outside your rental scope." }, 403);
  if (error?.code === "23514" || error?.code === "23505") {
    return reply({ error: "This reply could no longer be submitted. Reload the conversation." }, 409);
  }
  const state = conversationState.safeParse(data);
  if (error || !state.success) return reply({ error: "The conversation could not be confirmed." }, 503);
  if (typeof data?.notificationJobId === "string") scheduleCriticalRentalMail("job", data.notificationJobId);
  return reply(state.data);
}

export async function GET(request: Request) {
  const scope = scopeSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  return scope.success ? conversation(scope.data) : reply({ error: "Check the conversation reference." }, 400);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "Return to Crecy to send this reply." }, 403);
  const parsed = scopeSchema.extend(conversationMessageInput.shape).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Enter a reply before sending." }, 400);
  return conversation(parsed.data, { body: parsed.data.body, operation: parsed.data.operation });
}
