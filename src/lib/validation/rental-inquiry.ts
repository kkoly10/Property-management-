import { z } from "zod";

export const rentalInquiryLocales = ["en-US", "en-CA", "es-MX", "fr-CA"] as const;

export const submitRentalInquirySchema = z.object({
  publicId: z.uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email().trim().max(320),
  question: z.string().trim().min(10).max(2000),
  locale: z.enum(rentalInquiryLocales).default("en-US"),
}).strict();

export const verifyRentalInquirySchema = z.object({
  token: z.string().trim().toLowerCase().regex(/^[0-9a-f]{64}$/),
}).strict();

export const closeRentalInquirySchema = z.object({
  organizationId: z.uuid(),
  inquiryId: z.uuid(),
  expectedVersion: z.number().int().min(1),
}).strict();

export type SubmitRentalInquiryInput = z.infer<typeof submitRentalInquirySchema>;
