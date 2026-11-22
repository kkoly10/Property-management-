import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRentalInquirySchema } from "@/lib/validation/rental-inquiry";

const response = (body: unknown, status = 200) => NextResponse.json(body, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

export async function POST(request: Request) {
  const parsed = verifyRentalInquirySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return response({ verified: false, message: "This verification link is invalid or expired." });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("verify_public_rental_inquiry", {
      p_token: parsed.data.token,
    });
    if (error || !data) {
      return response({ verified: false, message: "This verification link is invalid or expired." });
    }
    const result = data as { verified?: unknown; inquiryReference?: unknown; status?: unknown };
    if (result.verified !== true) {
      return response({ verified: false, message: "This verification link is invalid or expired." });
    }
    return response({
      verified: true,
      inquiryReference: typeof result.inquiryReference === "string" ? result.inquiryReference : null,
      status: result.status === "closed" ? "closed" : "open",
    });
  } catch {
    return response({ verified: false, message: "Verification is temporarily unavailable." }, 503);
  }
}
