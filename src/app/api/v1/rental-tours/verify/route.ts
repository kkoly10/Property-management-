import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRentalTourSchema } from "@/lib/validation/rental-tour";

const response = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request) {
  const parsed = verifyRentalTourSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return response({ verified: false, message: "This verification link is invalid or expired." });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("verify_public_rental_tour", {
      p_token: parsed.data.token,
    });
    if (error || !data) {
      return response({ verified: false, message: "This verification link is invalid or expired." });
    }
    const result = data as { verified?: unknown; tourReference?: unknown; status?: unknown };
    if (result.verified !== true) {
      return response({ verified: false, message: "This verification link is invalid or expired." });
    }
    return response({
      verified: true,
      tourReference: typeof result.tourReference === "string" ? result.tourReference : null,
      status: result.status === "confirmed" ? "confirmed" : "requested",
    });
  } catch {
    return response({ verified: false, message: "Verification is temporarily unavailable." }, 503);
  }
}
