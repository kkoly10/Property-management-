import { z } from "zod";

const countryCode = z.enum(["US", "CA", "MX"]);

export const organizationSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens."),
  customerPath: z.enum(["self_managing", "property_manager"]),
  headquartersCountryCode: countryCode,
  defaultLocale: z.enum(["en-US", "es-MX", "en-CA", "fr-CA"]),
  defaultTimeZone: z.string().trim().min(1),
  acceptedTerms: z.literal("on", { error: "Accept the Terms and Privacy Notice to continue." }),
  idempotencyKey: z.uuid(),
});

export const entityBookSchema = z
  .object({
    legalName: z.string().trim().min(1).max(200),
    displayName: z.string().trim().min(1).max(160),
    countryCode,
    entityType: z.enum(["individual", "sole_proprietor", "company", "partnership", "trust", "other"]),
    currencyCode: z.enum(["USD", "CAD", "MXN"]),
    bookName: z.string().trim().min(1).max(120),
    idempotencyKey: z.uuid(),
  })
  .superRefine((value, context) => {
    const expectedCurrency = { US: "USD", CA: "CAD", MX: "MXN" }[value.countryCode];
    if (value.currencyCode !== expectedCurrency) {
      context.addIssue({ code: "custom", path: ["currencyCode"], message: `${value.countryCode} books must start in ${expectedCurrency}.` });
    }
  });

export type OrganizationInput = z.infer<typeof organizationSchema>;
export type EntityBookInput = z.infer<typeof entityBookSchema>;
