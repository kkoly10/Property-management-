import { z } from "zod";
import { senderFor } from "@/lib/notifications/sender";
import { verifyStandardWebhook } from "@/lib/notifications/standard-webhooks";
import { carriesCredentialInUrl } from "@/lib/runtime/worker-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 128 * 1024;
const statusByEvent = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
} as const;
const eventTypeSchema = z.object({ type: z.string() });
const trackedEventSchema = z.object({
  type: z.custom<keyof typeof statusByEvent>((value) => typeof value === "string" && Object.hasOwn(statusByEvent, value)),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({ email_id: z.uuid(), from: z.string().min(3).max(512) }),
});

function mailbox(value: string): string | undefined {
  const address = (value.match(/<([^<>]+)>\s*$/)?.[1] ?? value).trim().toLowerCase();
  return z.email().safeParse(address).data;
}

function reply(body: { received: true } | { error: string }, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function readPayload(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks, size));
}

export async function POST(request: Request) {
  if (carriesCredentialInUrl(request.url)) return reply({ error: "Invalid request." }, 400);

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return reply({ error: "Delivery receipt intake is unavailable." }, 503);

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !/^[A-Za-z0-9_-]{1,160}$/.test(id) || !timestamp || !/^\d{1,12}$/.test(timestamp)
    || !signature || signature.length > 2048) {
    return reply({ error: "Invalid webhook signature." }, 401);
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return reply({ error: "Request body is too large." }, 413);
  }

  let payload: string | null;
  try {
    payload = await readPayload(request);
  } catch {
    return reply({ error: "Invalid webhook payload." }, 400);
  }
  if (payload === null) return reply({ error: "Request body is too large." }, 413);
  const verification = verifyStandardWebhook({ payload, headers: { id, timestamp, signature }, secret });
  if (!verification.ok) {
    return verification.reason === "NO_SECRET"
      ? reply({ error: "Delivery receipt intake is unavailable." }, 503)
      : reply({ error: "Invalid webhook signature." }, 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(payload) as unknown;
  } catch {
    return reply({ error: "Invalid webhook payload." }, 400);
  }
  const envelope = eventTypeSchema.safeParse(body);
  if (!envelope.success) return reply({ error: "Invalid webhook payload." }, 400);
  if (!Object.hasOwn(statusByEvent, envelope.data.type)) return reply({ received: true });
  const event = trackedEventSchema.safeParse(body);
  if (!event.success) return reply({ error: "Invalid delivery event." }, 400);
  const from = mailbox(event.data.data.from);
  // The Resend account services multiple brands. Only Crecy's configured senders may be
  // correlated, including callbacks that arrive before the worker records provider acceptance.
  if (!from || !(["operator", "resident", "owner"] as const).some(
    (audience) => mailbox(senderFor("resend_delivery_receipt", audience).from) === from,
  )) return reply({ received: true });

  try {
    const { data, error } = await createAdminClient().rpc("record_resend_notification_event", {
      p_event_id: id,
      p_provider_message_id: event.data.data.email_id,
      p_status: statusByEvent[event.data.type],
      p_occurred_at: event.data.created_at,
    });
    if (!error && typeof data === "boolean") return reply({ received: true });
  } catch {
    // Return a retryable response if the database is temporarily unavailable.
  }
  return reply({ error: "Delivery receipt intake is unavailable." }, 503);
}
