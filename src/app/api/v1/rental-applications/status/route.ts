import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applicationAccessToken } from "@/lib/rental-application-access";
import { rentalEvidenceEnabled } from "@/lib/rental-evidence/http";
import { rentalApplicationProgressSchema } from "@/lib/validation/rental-application";

const headers = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json(
  { error: "This application access link has expired or is no longer available." },
  { status: 404, headers },
);
const temporarilyUnavailable = () => NextResponse.json(
  { error: "Application status is temporarily unavailable." }, { status: 503, headers },
);

export async function GET(request: Request) {
  const refs = new URL(request.url).searchParams.getAll("ref");
  const reference = refs.length === 1 ? refs[0] : "";
  const access = await applicationAccessToken(reference);
  if (!access) return unavailable();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("get_rental_application_progress", {
      p_access_token: access,
      p_reference: reference,
    });
    if (error) return temporarilyUnavailable();
    if (!data || data.applicationReference !== reference) return unavailable();
    const result = rentalApplicationProgressSchema.safeParse(data);
    if (!result.success) return temporarilyUnavailable();
    const progress = result.data;
    if ("evidenceAvailable" in progress) progress.evidenceAvailable &&= rentalEvidenceEnabled();
    return NextResponse.json(progress, { headers });
  } catch {
    return temporarilyUnavailable();
  }
}
