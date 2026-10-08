import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitRentalTourSchema } from "@/lib/validation/rental-tour";

const accepted = () => NextResponse.json(
  { accepted: true, message: "Check your email to verify the tour request before it is shared." },
  { status: 202, headers: { "Cache-Control": "private, no-store" } },
);

function reply(error: string, status: number) {
  return NextResponse.json({ error }, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
}

function networkHash(request: Request): string | null | "unavailable" {
  const secret = process.env.RENTAL_INQUIRY_RATE_LIMIT_SECRET?.trim();
  if (!secret || secret.includes("replace_me") || secret.length < 32) return "unavailable";
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "";
  if (!forwarded) return null;
  return createHmac("sha256", secret).update(`rental-tour-ip:${forwarded}`).digest("hex");
}

export async function POST(request: Request) {
  const parsed = submitRentalTourSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply("Check your contact details and preferred times.", 400);

  const operationKey = request.headers.get("idempotency-key");
  if (!operationKey || operationKey.length < 8 || operationKey.length > 200) {
    return reply("The tour request could not be prepared.", 400);
  }

  const hash = networkHash(request);
  if (hash === "unavailable") return reply("Tour requests are temporarily unavailable.", 503);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("submit_public_rental_tour_request", {
      p_public_id: parsed.data.publicId,
      p_first_name: parsed.data.firstName,
      p_last_name: parsed.data.lastName,
      p_email: parsed.data.email,
      p_preferences: parsed.data.preferences,
      p_network_hash: hash,
      p_locale: parsed.data.locale,
      p_idempotency_key: operationKey,
    });
    if (error || !data) {
      const message = error?.message ?? "";
      if (message.includes("LISTING_NOT_AVAILABLE") || error?.code === "P0002") {
        return reply("This listing is not accepting tour requests.", 404);
      }
      if (message.includes("IDEMPOTENCY_CONFLICT")) {
        return reply("This tour request key was already used for different details.", 409);
      }
      if (message.includes("DUPLICATE_TOUR_PREFERENCE")) {
        return reply("Choose different preferred tour times.", 400);
      }
      if (message.includes("INVALID_TOUR_LOCAL_TIME")) {
        return reply("One preferred time is not valid in the rental's local time zone.", 400);
      }
      if (message.includes("TOUR_PREFERENCE_OUT_OF_RANGE")) {
        return reply("Choose future tour times within the next 60 days.", 400);
      }
      if (error?.code?.startsWith("22")) {
        return reply("Check your contact details and preferred times.", 400);
      }
      return reply("Tour requests are temporarily unavailable.", 503);
    }
    return accepted();
  } catch {
    return reply("Tour requests are temporarily unavailable.", 503);
  }
}
