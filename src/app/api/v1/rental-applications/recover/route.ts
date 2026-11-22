import { NextResponse } from "next/server";
import { z } from "zod";
import { rentalApplicationRateLimit } from "@/lib/rental-application-rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { recoverRentalApplicationSchema } from "@/lib/validation/rental-application";

const headers = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ error: "Recovery is temporarily unavailable." }, { status: 503, headers });

export async function POST(request: Request) {
  const parsed = recoverRentalApplicationSchema.safeParse(await request.json().catch(() => null));
  const key = z.uuid().safeParse(request.headers.get("idempotency-key"));
  if (!parsed.success || !key.success) {
    return NextResponse.json({ error: "Check the application reference and email address." }, { status: 400, headers });
  }
  const rateLimit = rentalApplicationRateLimit(request, "recovery");
  if (!rateLimit) return unavailable();
  try {
    const { data, error } = await createAdminClient().rpc("request_rental_application_recovery", {
      p_reference: parsed.data.reference,
      p_email: parsed.data.email,
      p_application_contact_hash: rateLimit.recoveryContactHash(parsed.data.reference, parsed.data.email),
      p_network_hash: rateLimit.networkHash,
      p_operation_key: key.data,
    });
    if (error || data?.accepted !== true) return unavailable();
    return NextResponse.json({ accepted: true }, { status: 202, headers });
  } catch {
    return unavailable();
  }
}
