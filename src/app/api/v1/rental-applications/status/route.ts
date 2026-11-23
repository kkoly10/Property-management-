import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applicationAccessToken } from "@/lib/rental-application-access";
import { rentalEvidenceEnabled } from "@/lib/rental-evidence/http";

const headers = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json(
  { error: "This application access link has expired or is no longer available." },
  { status: 404, headers },
);

export async function GET(request: Request) {
  const refs = new URL(request.url).searchParams.getAll("ref");
  const reference = refs.length === 1 ? refs[0] : "";
  const access = await applicationAccessToken(reference);
  if (!access) return unavailable();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("get_public_rental_application_for_access", {
      p_access_token: access,
    });
    if (error || !data || data.applicationReference !== reference) return unavailable();
    if (rentalEvidenceEnabled()) {
      const evidence = await admin.rpc("rental_evidence_available_for_access", { p_access_token: access });
      if (!evidence.error && evidence.data === true) data.evidenceAvailable = true;
    }
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "Application status is temporarily unavailable." },
      { status: 503, headers });
  }
}
