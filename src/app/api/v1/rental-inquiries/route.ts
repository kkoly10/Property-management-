import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitRentalInquirySchema } from "@/lib/validation/rental-inquiry";

const accepted = () => NextResponse.json(
  { accepted: true, message: "Check your email to verify your question before it is shared." },
  { status: 202, headers: { "Cache-Control": "private, no-store" } },
);

function reply(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
}

function networkHash(request: Request): string | null | "unavailable" {
  const secret = process.env.RENTAL_INQUIRY_RATE_LIMIT_SECRET?.trim();
  if (!secret || secret.includes("replace_me") || secret.length < 32) return "unavailable";
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "";
  if (!forwarded) return null;
  return createHmac("sha256", secret).update(`rental-inquiry-ip:${forwarded}`).digest("hex");
}

export async function POST(request: Request) {
  const parsed = submitRentalInquirySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply("Check your contact details and question.", 400);

  const operationKey = request.headers.get("idempotency-key");
  if (!operationKey || operationKey.length < 8 || operationKey.length > 200) {
    return reply("The inquiry request could not be prepared.", 400);
  }

  const hash = networkHash(request);
  if (hash === "unavailable") return reply("Inquiry intake is temporarily unavailable.", 503);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("submit_public_rental_inquiry", {
      p_public_id: parsed.data.publicId,
      p_first_name: parsed.data.firstName,
      p_last_name: parsed.data.lastName,
      p_email: parsed.data.email,
      p_question: parsed.data.question,
      p_network_hash: hash,
      p_locale: parsed.data.locale,
      p_idempotency_key: operationKey,
    });
    if (error || !data) {
      const message = error?.message ?? "";
      if (message.includes("LISTING_NOT_AVAILABLE") || error?.code === "P0002") {
        return reply("This listing is not accepting questions.", 404);
      }
      if (message.includes("IDEMPOTENCY_CONFLICT")) {
        return reply("This inquiry request key was already used for different details.", 409);
      }
      if (error?.code?.startsWith("22")) return reply("Check your contact details and question.", 400);
      return reply("Inquiry intake is temporarily unavailable.", 503);
    }
    return accepted();
  } catch {
    return reply("Inquiry intake is temporarily unavailable.", 503);
  }
}
