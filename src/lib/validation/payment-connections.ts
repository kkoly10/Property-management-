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
