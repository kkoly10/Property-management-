import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/redirect";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  // Constrained to this origin: `new URL(next, base)` returns another host for an absolute or
  // protocol-relative value, which would make this an open redirect on the authentication path.
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"), "/onboarding/organization");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL("/signup?auth_error=1", request.url));
}
