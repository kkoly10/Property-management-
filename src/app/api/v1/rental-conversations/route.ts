import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { scheduleCriticalRentalMail } from "@/lib/notifications/rental-fast-mail";
import { conversationMessageInput, conversationReference, conversationState, conversationToken,
  prospectTourReference, prospectTourState } from "@/lib/rental-conversation";
import { createAdminClient } from "@/lib/supabase/admin";
import { rentalTourLocalTimeSchema } from "@/lib/validation/rental-tour";

const tourWrite = z.object({ reference: prospectTourReference, version: z.number().int().positive(), operation: z.uuid() });
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), token: conversationToken }).strict(),
  z.object({ action: z.literal("recover"), reference: conversationReference, email: z.email().trim().max(320) }).strict(),
  conversationMessageInput.extend({ action: z.literal("reply"), reference: conversationReference }).strict(),
  tourWrite.extend({ action: z.literal("tour-cancel") }).strict(),
  tourWrite.extend({ action: z.literal("tour-reschedule"), preferences: z.array(rentalTourLocalTimeSchema).min(1).max(3) }).strict(),
]);
const cookieName = process.env.NODE_ENV === "production" ? "__Host-crecy-rental-conversation" : "crecy-rental-conversation";
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const unavailable = () => response({ error: "Open the secure link from your email or request a new link." }, 404);

function sessionFrom(request: NextRequest) {
  return conversationToken.safeParse(request.cookies.get(cookieName)?.value);
}

export async function GET(request: NextRequest) {
  const session = sessionFrom(request);
  if (!session.success) return unavailable();
  const expected = request.nextUrl.searchParams.get("ref");
  const reference = expected === null ? undefined : conversationReference.safeParse(expected);
  if (reference && !reference.success) return unavailable();
  try {
    const client = createAdminClient();
    const { data } = await client.rpc("access_rental_conversation", {
      p_session: session.data, ...(reference?.success ? { p_expected_reference: reference.data } : {}),
    });
    const found = conversationState.safeParse(data);
    if (!found.success) return unavailable();
    if (!prospectTourReference.safeParse(found.data.reference).success) return response(found.data);
    const tour = await client.rpc("manage_rental_prospect_tour", {
      p_session: session.data, p_reference: found.data.reference,
    });
    const status = prospectTourState.safeParse(tour.data);
    return response(status.success ? { ...found.data, tour: status.data } : found.data);
  } catch {
    return response({ error: "This conversation is temporarily unavailable." }, 503);
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return response({ error: "This request must come from the rental page." }, 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "Check the conversation details and try again." }, 400);
  const input = parsed.data;
  try {
    const client = createAdminClient();
    if (input.action === "open") {
      const { data } = await client.rpc("redeem_rental_conversation", { p_token: input.token });
      const session = conversationToken.safeParse(data?.session);
      const reference = conversationReference.safeParse(data?.reference);
      if (!session.success || !reference.success) return unavailable();
      const res = response({ reference: reference.data });
      res.cookies.set(cookieName, session.data, {
        path: "/", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 86400,
      });
      return res;
    }
    if (input.action === "recover") {
      const secret = process.env.RENTAL_INQUIRY_RATE_LIMIT_SECRET?.trim();
      const source = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
      if (!secret || secret.length < 32 || secret.includes("replace_me") || (process.env.NODE_ENV === "production" && !isIP(source))) {
        return response({ error: "Conversation links are temporarily unavailable." }, 503);
      }
      const { data, error } = await client.rpc("recover_rental_conversation", {
        p_reference: input.reference, p_email: input.email,
        p_network_hash: createHmac("sha256", secret).update(`rental-conversation:${source}`).digest("hex"),
      });
      if (error) return response({ error: "Conversation links are temporarily unavailable." }, 503);
      if (typeof data === "string") scheduleCriticalRentalMail("job", data);
      return response({ accepted: true }, 202);
    }
    const session = sessionFrom(request);
    if (!session.success) return unavailable();
    if (input.action === "tour-cancel" || input.action === "tour-reschedule") {
      if (origin !== request.nextUrl.origin) return response({ error: "Return to Crecy to update your tour." }, 403);
      const { data, error } = await client.rpc("manage_rental_prospect_tour", {
        p_session: session.data, p_reference: input.reference, p_expected_version: input.version,
        p_action: input.action === "tour-cancel" ? "cancel" : "reschedule", p_operation: input.operation,
        ...(input.action === "tour-reschedule" ? { p_preferences: input.preferences } : {}),
      });
      if (error?.message === "TOUR_CHANGE_WAIT") return response({ error: "Wait a moment before proposing new times again." }, 409);
      if (error?.code === "40001" || error?.code === "23505") return response({ error: "This tour changed. Reload it and try again." }, 409);
      if (error?.code === "23514") return response({ error: "This tour can no longer be changed this way." }, 409);
      if (error?.code?.startsWith("22")) return response({ error: "Choose distinct, future times in the rental’s time zone." }, 400);
      if (error) return response({ error: "The tour update could not be confirmed. Retry the same update." }, 503);
      const tour = prospectTourState.safeParse(data);
      return tour.success ? response({ tour: tour.data }) : unavailable();
    }
    const { data, error } = await client.rpc("access_rental_conversation", {
      p_session: session.data, p_body: input.body, p_operation: input.operation, p_expected_reference: input.reference,
    });
    if (error?.code === "23514" || error?.code === "23505") {
      return response({ error: "This reply could no longer be submitted. Reload the conversation." }, 409);
    }
    if (error) return response({ error: "The reply could not be confirmed. Retry the same reply." }, 503);
    const found = conversationState.safeParse(data);
    return found.success ? response(found.data) : response({ error: "Reopen the link for this conversation before replying." }, 409);
  } catch {
    return response({ error: "This conversation is temporarily unavailable." }, 503);
  }
}
