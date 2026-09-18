import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");
const reserved = new Set([
  "www","app","owner","vendor","admin","api","platform","mail","auth",
  "static","assets","cdn","internal","maplecourt",
]);

/**
 * Accept what a person naturally types into a phone field, but persist one canonical value.
 *
 * - +15405551234 stays +15405551234
 * - 5405551234 becomes +15405551234
 * - 1 (540) 555-1234 becomes +15405551234
 * - non-NANP international numbers still require an explicit +country code
 */
export function normalizePhoneE164(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/[\s().-]/g, "");
  if (/^\+[1-9][0-9]{7,14}$/.test(compact)) return compact;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return null;
}

const phoneE164 = z.string().trim().transform((value, ctx) => {
  const normalized = normalizePhoneE164(value);
  if (normalized == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a 10-digit US/Canada number or an international number with +country code.",
    });
    return z.NEVER;
  }
  return normalized;
});

export const livingCommunityProfileSchema = z.object({
  propertyId: z.string().uuid(),
  subdomain: z.string().trim().toLowerCase()
    .min(1, "Choose a community address.")
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/, "Use lowercase letters, numbers, and hyphens.")
    .refine((value) => !reserved.has(value), "That community address is reserved."),
  displayName: z.string().trim().min(1, "Add the community name.").max(160),
  publicAddressText: optionalText(300),
  headline: optionalText(160),
  leasingEmail: z.union([z.literal(""), z.string().trim().email().max(254)]).default(""),
  leasingPhoneE164: phoneE164.default(""),
  officeHours: z.array(z.string().trim().min(1).max(160)).max(14).default([]),
  amenities: z.array(z.string().trim().min(1).max(120)).max(24).default([]),
  publicNoticeTitle: optionalText(160),
  publicNoticeBody: optionalText(2000),
  status: z.enum(["draft","published","archived"]),
  expectedVersion: z.number().int().min(0),
});

export type LivingCommunityProfileInput = z.infer<typeof livingCommunityProfileSchema>;
