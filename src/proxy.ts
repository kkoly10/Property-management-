import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { routeForHost } from "@/lib/runtime/host-routing";

export async function proxy(request: NextRequest) {
  // Host canonicalization FIRST, and before any session work. None of these decisions needs a session,
  // so none of these responses can carry a rotated Set-Cookie — which is what makes it safe to emit
  // them ahead of the Supabase client the rest of the pipeline constructs.
  // nextUrl carries the resolved request host; the raw Host header is only a fallback, and neither is
  // ever treated as authorization — classification decides routing, RLS decides access.
  const host = request.nextUrl.host || request.headers.get("host");
  const decision = routeForHost(host, request.nextUrl.pathname, request.nextUrl.search);

  if (decision.type === "reject") {
    // An unrecognized production host gets nothing. Rendering Crecy for whatever hostname happens to
    // resolve here would let any domain pointed at this deployment impersonate the product.
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" },
    });
  }

  if (decision.type === "redirect") {
    // Path-only locations keep the current host; absolute ones cross to another Crecy surface.
    const location = decision.location.startsWith("/")
      ? new URL(decision.location, request.nextUrl)
      : decision.location;
    return NextResponse.redirect(location, decision.permanent ? 308 : 307);
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
