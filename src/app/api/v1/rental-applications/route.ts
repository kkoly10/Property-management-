import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitRentalApplicationSchema } from "@/lib/validation/rental-application";

const headers = { "Cache-Control": "private, no-store" };
function reply(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers });
}

function networkHash(request: Request): string | null | "unavailable" {
  const secret = process.env.RENTAL_INQUIRY_RATE_LIMIT_SECRET?.trim();
  if (!secret || secret.includes("replace_me") || secret.length < 32) return "unavailable";
  // Accept only the edge-controlled forwarded source; x-real-ip may originate
  // from an untrusted upstream and must not silently replace a missing header.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  // Direct Vercel requests include an edge-supplied source IP. In production,
  // missing proxy metadata must not silently disable the network abuse budget.
  // Deployment behind another proxy still requires a separate header-trust review.
  // The forwarded value must be a syntactically valid IPv4/IPv6 address; an
  // unknown or malformed proxy token must never mint its own abuse-budget key.
  if (isIP(forwarded) === 0) {
    return process.env.NODE_ENV === "production" ? "unavailable" : null;
  }
  return createHmac("sha256", secret).update(`rental-application-ip:${forwarded}`).digest("hex");
}

export async function POST(request: Request) {
  const parsed = submitRentalApplicationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Check your contact details and desired move-in date." }, 400);
  const operationKey = request.headers.get("idempotency-key");
  if (!operationKey || operationKey.length < 8 || operationKey.length > 200) {
    return reply({ error: "The application request could not be prepared." }, 400);
  }
  const hash = networkHash(request);
  if (hash === "unavailable") return reply({ error: "Applications are temporarily unavailable." }, 503);
  try {
    const admin = createAdminClient();
    const { error, data } = await admin.rpc("submit_public_rental_application", {
      p_public_id: parsed.data.publicId,
      p_first_name: parsed.data.firstName,
      p_last_name: parsed.data.lastName,
      p_email: parsed.data.email,
      p_desired_move_in_on: parsed.data.desiredMoveInOn,
      p_lease_term_text: parsed.data.leaseTermText,
      p_applicant_note: parsed.data.applicantNote,
      p_network_hash: hash,
      p_locale: parsed.data.locale,
      p_idempotency_key: operationKey,
    });
    // Do not turn an unexpected or incomplete RPC envelope into a false
    // acceptance receipt. The SQL returns { accepted: true } for both a new
    // submission and its privacy-preserving neutral rate-limit response.
    if (error || !data || data.accepted !== true) {
      const message = error?.message ?? "";
      if (message.includes("LISTING_NOT_AVAILABLE") || error?.code === "P0002") {
        return reply({ error: "This listing is not accepting applications." }, 404);
      }
      if (message.includes("IDEMPOTENCY_CONFLICT")) {
        return reply({ error: "This request key was already used for different details." }, 409);
      }
      if (message.includes("INVALID_DESIRED_MOVE_IN_DATE")) {
        return reply({ error: "Choose a future move-in date after the listing's available date, within one year." }, 400);
      }
      if (error?.code?.startsWith("22")) {
        return reply({ error: "Check your contact details and desired move-in date." }, 400);
      }
      return reply({ error: "Applications are temporarily unavailable." }, 503);
    }
    return reply({
      accepted: true,
      message: "Check your email to verify the application before the landlord can see it.",
    }, 202);
  } catch {
    return reply({ error: "Applications are temporarily unavailable." }, 503);
  }
}
