import { NextResponse } from "next/server";
import { applicationAccessCookieName, applicationAccessCookieOptions } from "@/lib/rental-application-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRentalApplicationSchema } from "@/lib/validation/rental-application";

const headers = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ verified: false, message: "Recovery is temporarily unavailable." }, { status: 503, headers });
const invalid = () => NextResponse.json({ verified: false, message: "This recovery link is invalid, expired, or has already been used." }, { headers });

export async function POST(request: Request) {
  const parsed = verifyRentalApplicationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid();
  try {
    const { data, error } = await createAdminClient().rpc("confirm_rental_application_recovery", { p_token: parsed.data.token });
    if (error) return unavailable();
    if (data?.verified !== true) return invalid();
    const reference = typeof data.applicationReference === "string" ? data.applicationReference : "";
    const cookieName = applicationAccessCookieName(reference);
    const access = typeof data.accessToken === "string" ? data.accessToken : "";
    if (!cookieName || !/^[0-9a-f]{64}$/.test(access)) return unavailable();

    const response = NextResponse.json({ verified: true, accessGranted: true, applicationReference: reference,
      message: "You can now view your application on this browser." }, { headers });
    response.cookies.set(cookieName, access, applicationAccessCookieOptions);
    return response;
  } catch {
    return unavailable();
  }
}
