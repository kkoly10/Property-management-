import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { headers, status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ privacyRequestId: string }> },
) {
  const { privacyRequestId } = await params;
  if (!z.uuid().safeParse(privacyRequestId).success) return errorResponse("Account export unavailable.", 404);

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return errorResponse("Sign in to download your account data.", 401);

  const { data, error } = await supabase.rpc("get_own_privacy_account_export", {
    p_privacy_request_id: privacyRequestId,
  });
  if (error?.message === "PRIVACY_EXPORT_NOT_FOUND") return errorResponse("Account export unavailable.", 404);
  if (error?.message === "MFA_STEP_UP_REQUIRED") return errorResponse("Verify with your authenticator before downloading account data.", 403);
  if (error || !data) return errorResponse("Account export temporarily unavailable.", 503);

  return NextResponse.json(data, {
    headers: { ...headers, "Content-Disposition": 'attachment; filename="crecy-account-export.json"' },
  });
}
