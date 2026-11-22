import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applicationAccessCookieName, applicationAccessCookieOptions } from "@/lib/rental-application-access";
import { verifyRentalApplicationSchema } from "@/lib/validation/rental-application";

const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const parsed = verifyRentalApplicationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ verified: false, message: "This verification link is invalid or expired." }, { headers: noStore });
  }
  try {
    const { data, error } = await createAdminClient().rpc("verify_public_rental_application", {
      p_token: parsed.data.token,
    });
    if (error || !data || data.verified !== true) {
      return NextResponse.json({ verified: false, message: "This verification link is invalid or expired." }, { headers: noStore });
    }
    const reference = typeof data.applicationReference === "string" ? data.applicationReference : "";
    const cookieName = applicationAccessCookieName(reference);
    // A truthy database flag without a canonical reference is not a
    // confirmed verification. Do not render a success receipt in that case.
    if (!cookieName) {
      return NextResponse.json({ verified: false, message: "Verification could not be confirmed. Retry this link." },
        { status: 502, headers: noStore });
    }
    const rawAccess = typeof data.accessToken === "string" ? data.accessToken : null;
    if (rawAccess !== null && !/^[0-9a-f]{64}$/.test(rawAccess)) {
      return NextResponse.json(
        { verified: false, message: "Verification could not be confirmed. Retry this link." },
        { status: 502, headers: noStore },
      );
    }
    const access = cookieName && rawAccess ? rawAccess : null;
    const response = NextResponse.json({
      verified: true,
      accessGranted: Boolean(access),
      applicationReference: reference || null,
      message: access ? "Your application is verified." : "This link has already been used. Use the original browser to view your application.",
    }, { headers: noStore });
    if (access && cookieName) response.cookies.set(cookieName, access, applicationAccessCookieOptions);
    return response;
  } catch {
    return NextResponse.json({ verified: false, message: "Verification is temporarily unavailable." }, { status: 503, headers: noStore });
  }
}
