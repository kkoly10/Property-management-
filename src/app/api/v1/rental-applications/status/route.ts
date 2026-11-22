import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applicationAccessToken } from "@/lib/rental-application-access";

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
    const { data, error } = await createAdminClient().rpc("get_public_rental_application_for_access", {
      p_access_token: access,
    });
    if (error || !data || data.applicationReference !== reference) return unavailable();
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "Application status is temporarily unavailable." },
      { status: 503, headers });
  }
}
