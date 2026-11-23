import { NextResponse } from "next/server";
import { rentalApplicationRateLimit } from "@/lib/rental-application-rate-limit";
import { scheduleCriticalRentalMail } from "@/lib/notifications/rental-fast-mail";
import { rentalEvidenceIntakeEnabled } from "@/lib/rental-evidence/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitRentalApplicationSchema } from "@/lib/validation/rental-application";

const headers = { "Cache-Control": "private, no-store" };
function reply(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: Request) {
  const parsed = submitRentalApplicationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Check your contact details and desired move-in date." }, 400);
  const operationKey = request.headers.get("idempotency-key");
  if (!operationKey || operationKey.length < 8 || operationKey.length > 200) {
    return reply({ error: "The application request could not be prepared." }, 400);
  }
  const rateLimit = rentalApplicationRateLimit(request, "submission");
  if (!rateLimit) return reply({ error: "Applications are temporarily unavailable." }, 503);
  try {
    const admin = createAdminClient();
    const args = {
      p_public_id: parsed.data.publicId,
      p_first_name: parsed.data.firstName,
      p_last_name: parsed.data.lastName,
      p_email: parsed.data.email,
      p_desired_move_in_on: parsed.data.desiredMoveInOn,
      p_lease_term_text: parsed.data.leaseTermText,
      p_applicant_note: parsed.data.applicantNote,
      p_network_hash: rateLimit.networkHash,
      p_locale: parsed.data.locale,
      p_idempotency_key: operationKey,
    };
    const submitWithRequirements = rentalEvidenceIntakeEnabled()
      ? "submit_rental_application_with_document_intake" : "submit_rental_application_with_requirements";
    const { error, data } = parsed.data.requirementsVersion
      ? await admin.rpc(submitWithRequirements, { ...args, p_requirements_version: parsed.data.requirementsVersion })
      : await admin.rpc("submit_public_rental_application", args);
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
      if (message.includes("APPLICATION_REQUIREMENTS_CHANGED")) {
        return reply({ error: "The listing requirements changed. Refresh the listing and review them before applying." }, 409);
      }
      if (message.includes("INVALID_DESIRED_MOVE_IN_DATE")) {
        return reply({ error: "Choose a future move-in date after the listing's available date, within one year." }, 400);
      }
      if (error?.code?.startsWith("22")) {
        return reply({ error: "Check your contact details and desired move-in date." }, 400);
      }
      return reply({ error: "Applications are temporarily unavailable." }, 503);
    }
    scheduleCriticalRentalMail("application", { publicId: parsed.data.publicId, email: parsed.data.email, operationKey });
    return reply({
      accepted: true,
      message: "Check your email to verify the application before the landlord can see it.",
    }, 202);
  } catch {
    return reply({ error: "Applications are temporarily unavailable." }, 503);
  }
}
