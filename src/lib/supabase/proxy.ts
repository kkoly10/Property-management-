import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

const protectedPrefixes = ["/app", "/onboarding", "/settings"];

export async function updateSession(request: NextRequest) {
  const config = getPublicSupabaseConfig();

  if (!config) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  const isProtected = protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix));

  if (isProtected && (error || !data.user)) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/login";
    signInUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
