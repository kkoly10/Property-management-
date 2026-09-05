import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");
const reserved = new Set([
  "www","app","owner","vendor","admin","api","platform","mail","auth",
  "static","assets","cdn","internal","maplecourt",
]);

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
  leasingPhoneE164: z.union([
    z.literal(""),
    z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/, "Use E.164 format, e.g. +15405551234."),
  ]).default(""),
  officeHours: z.array(z.string().trim().min(1).max(160)).max(14).default([]),
  amenities: z.array(z.string().trim().min(1).max(120)).max(24).default([]),
  publicNoticeTitle: optionalText(160),
  publicNoticeBody: optionalText(2000),
  status: z.enum(["draft","published","archived"]),
  expectedVersion: z.number().int().min(0),
});

export type LivingCommunityProfileInput = z.infer<typeof livingCommunityProfileSchema>;
