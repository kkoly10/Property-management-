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
  // REQUIRED, not "compare if present". A submission that omits it is not a submission that happens to
  // skip a check — it is a submission that cannot say which documents were accepted, and consent
  // evidence that cannot name its artifacts is not evidence. The shape is the registry's binding
  // format: <code>@<version>+<code>@<version>#<16 hex>.
  consentVersion: z
    .string()
    .trim()
    .min(1, { error: "The accepted Terms and Privacy Notice version is missing. Reload and try again." })
    .max(400)
    .regex(/^[a-z0-9_]+@[^+#\s]+(?:\+[a-z0-9_]+@[^+#\s]+)*#[0-9a-f]{16}$/, {
      error: "The accepted Terms and Privacy Notice version is malformed. Reload and try again.",
    }),
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
