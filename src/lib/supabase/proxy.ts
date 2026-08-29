import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";
import { requiresSession } from "@/lib/marketing/navigation";
import { isCacheablePublicRequest } from "@/lib/runtime/host-routing";

export async function updateSession(request: NextRequest) {
  const config = getPublicSupabaseConfig();

  if (!config) {
    return NextResponse.next({ request });
  }

  // Public marketing and legal pages are handled BEFORE the session client is created, and this
  // ordering is a security requirement rather than an optimization. `createServerClient` below can
  // rotate the session and write Set-Cookie onto the response; a shared cache that stored such a
  // response would hand one visitor's session to the next. These pages are identical for every
  // visitor and need no session, so the safe thing is to never touch one here.
  // Host is consulted BEFORE the pathname. `app.crecyos.com/` and `owner.crecyos.com/` both have the
  // pathname `/`, and treating either as the cacheable marketing homepage on pathname alone is exactly
  // the confusion that would put an authenticated surface in a shared cache.
  if (isCacheablePublicRequest(request.nextUrl.host || request.headers.get("host"), request.nextUrl.pathname)) {
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
  const isProtected = requiresSession(request.nextUrl.pathname);

  if (isProtected && (error || !data.user)) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/login";
    signInUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Anything still here has been through the session client and may carry a rotated cookie, so it is
  // uncacheable without exception. Classification happened above; this is not a second decision.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
