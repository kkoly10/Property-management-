import { classifyHost, isLivingSurface, originForRequestHost } from "@/lib/runtime/host";
import { z } from "zod";

const applicationUrl = z.url({ protocol: /^https?$/ }).max(2048);

export const stripeOnboardingLinkSchema = z.object({
  organizationId: z.uuid(),
  operatingEntityId: z.uuid(),
  returnUrl: applicationUrl,
  refreshUrl: applicationUrl,
}).strict();

export type StripeOnboardingLinkInput = z.infer<typeof stripeOnboardingLinkSchema>;

export function isAllowedApplicationUrl(value: string, configuredSiteUrl: string) {
  try {
    const candidate = new URL(value);
    const site = new URL(configuredSiteUrl);
    return candidate.origin === site.origin && (candidate.protocol === "https:" || candidate.protocol === "http:");
  } catch {
    return false;
  }
}

/**
 * A resident Stripe return URL must land back on the EXACT Crecy Living origin the payment started from.
 *
 * Two checks, in this order, and the order is the point:
 *
 *   1. The request host itself must be a Crecy Living surface. An operator on app.crecyos.com, an owner
 *      on owner.crecyos.com or an unrecognized host cannot initiate a resident Checkout at all, so a
 *      return URL is never even considered for them.
 *   2. The candidate must match that host's own origin exactly. Not "any *.crecyliving.com" — the
 *      return target is browser-supplied, and allowing the wildcard would let a payment begun at
 *      lakewood.crecyliving.com return to park-view.crecyliving.com.
 *
 * Production origins must be https. Development hosts (localhost, Playwright, *.vercel.app) keep their
 * own scheme and port, or there would be no reachable origin to test against.
 */
export function isAllowedResidentReturnUrl(value: string, requestHost: string | null | undefined): boolean {
  const classification = classifyHost(requestHost);
  const isDevelopment = classification.kind === "development";
  if (!isLivingSurface(classification) && !isDevelopment) return false;

  const origin = originForRequestHost(requestHost);
  if (!origin) return false;

  try {
    const candidate = new URL(value);
    if (candidate.origin !== origin) return false;
    if (!isDevelopment && candidate.protocol !== "https:") return false;
    return true;
  } catch {
    return false;
  }
}
