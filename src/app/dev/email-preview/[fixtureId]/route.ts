import { NextResponse } from "next/server";
import { renderEmailFixture } from "@/lib/notifications/email-fixtures";
import { RECOGNIZED_DEPLOYMENT_ENVIRONMENTS } from "@/lib/legal/registry";

/**
 * Local email preview. **Never available in production.**
 *
 * Reviewing a transactional email in a browser is the only practical way to see what a recipient sees,
 * and rendering one from a fixture is far better than sending real mail to yourself. But a public
 * endpoint that returns arbitrary rendered Crecy email would be a gift to a phisher: a page on a real
 * Crecy origin, serving a real Crecy-branded message, behind a URL they control the last segment of.
 *
 * So the gate FAILS CLOSED, in the same shape as the legal publication gate:
 *
 *   * `VERCEL_ENV=production` is the platform's own word and is checked first, so no application
 *     variable can re-open this on a real production deployment.
 *   * An unrecognized `CRECY_DEPLOYMENT_ENV` is treated as production rather than guessed at, because
 *     a typo must not be the thing that exposes the route.
 *   * Anything unlabeled is treated as production too. A self-hosted deployment that sets nothing gets
 *     404, and a non-production environment has to say so.
 *
 * The fixture id is matched against a fixed list, so this cannot be turned into a renderer for
 * attacker-supplied content either.
 */
export const dynamic = "force-dynamic";

function previewIsAvailable(): boolean {
  if (process.env.VERCEL_ENV?.trim().toLowerCase() === "production") return false;

  const declared = process.env.CRECY_DEPLOYMENT_ENV?.trim().toLowerCase();
  if (declared) {
    if (!(RECOGNIZED_DEPLOYMENT_ENVIRONMENTS as readonly string[]).includes(declared)) return false;
    return declared !== "production";
  }

  const platform = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (platform === "preview" || platform === "development") return true;
  return process.env.NODE_ENV !== "production";
}

export async function GET(_request: Request, { params }: { params: Promise<{ fixtureId: string }> }) {
  if (!previewIsAvailable()) return new NextResponse(null, { status: 404 });

  const { fixtureId } = await params;
  const fixture = renderEmailFixture(fixtureId);
  if (!fixture) return new NextResponse(null, { status: 404 });

  return new NextResponse(fixture.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Not indexable, not cacheable, not embeddable — belt and braces on top of the 404 gate.
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
    },
  });
}
